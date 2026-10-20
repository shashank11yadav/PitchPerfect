import {
  LIMITS,
  normalizeTurnText,
  redactPii,
  STAGES,
  type CoachTurnEvent,
  type Stage,
  type Usage,
} from "@pitchperfect/shared";
import { PracticeAttempt } from "../../db/models/index.js";
import { AppError, ConflictError, NotFoundError, UpstreamError } from "../../errors.js";
import type { CoachClient } from "../../services/coach-client.js";
import { recordUsage } from "./quota.js";
import { scenarioOf, sessionEndsAt, studentTurnsOf, usableTranscript } from "./service.js";
import type { EndedReason, PracticeStream } from "./sse.js";
import { acquireTurnLock, releaseTurnLock, type TurnLock } from "./turn-lock.js";

/** The slice of a logger a turn needs; pino's `req.log` fits. Only ids, codes, and counts go in. */
interface TurnLog {
  info(fields: object, message: string): void;
  error(fields: object, message: string): void;
}

export type PreparedTurn =
  { kind: "ended"; reason: EndedReason } | { kind: "ready"; lock: TurnLock };

/**
 * Claims the attempt for one turn. A session that can take no more turns answers `ended` (without
 * holding the lock); a turn already in flight, or a session that has ended otherwise, is `409`.
 */
export async function prepareTurn(studentId: string, attemptId: string): Promise<PreparedTurn> {
  const now = new Date();
  const lock = await acquireTurnLock(attemptId, studentId, now);
  if (!lock) {
    const current = await PracticeAttempt.findOne({ _id: attemptId, studentId })
      .select("status")
      .lean();
    if (!current) throw new NotFoundError();
    if (current.status === "ended_by_guard") return { kind: "ended", reason: "guard_limit" };
    throw new ConflictError(
      "conflict",
      current.status === "active"
        ? "Wait for the reply to your last message"
        : "This practice session has ended",
    );
  }
  const reason: EndedReason | null =
    studentTurnsOf(lock.attempt) >= LIMITS.maxStudentTurns
      ? "turn_limit"
      : now >= sessionEndsAt(lock.attempt)
        ? "expired"
        : null;
  if (reason) {
    await releaseTurnLock(lock);
    return { kind: "ended", reason };
  }
  return { kind: "ready", lock };
}

/** Normalized, PII-redacted, and kept within the turn length (a placeholder can be longer). */
function redactTurn(text: string): string {
  return Array.from(redactPii(normalizeTurnText(text)))
    .slice(0, LIMITS.turnMaxChars)
    .join("");
}

/** The later of two stages: a session never moves backwards. */
const laterStage = (stored: Stage, next: Stage): Stage =>
  STAGES.indexOf(next) > STAGES.indexOf(stored) ? next : stored;

const tokensOf = (usage: Usage) => ({
  "tokens.input": usage.inputTokens,
  "tokens.output": usage.outputTokens,
});

/** Only codes the browser knows are passed on. */
const relayedCode = (code: string) =>
  code === "practice_unavailable" ? "practice_unavailable" : "upstream_error";

interface TurnContext {
  coach: CoachClient;
  log: TurnLog;
  stream: PracticeStream;
}

interface TurnOutcome {
  outcome: string;
  stage: Stage;
  usage?: Usage;
}

async function relayTurn(
  { coach, stream }: TurnContext,
  { attempt }: TurnLock,
  studentText: string,
): Promise<TurnOutcome> {
  const turnsLeft = LIMITS.maxStudentTurns - (studentTurnsOf(attempt) + 1);
  const student = { role: "student" as const, text: studentText, at: new Date() };
  const events: AsyncIterable<CoachTurnEvent> = coach.turn(
    {
      skill: attempt.skill,
      ...scenarioOf(attempt),
      transcript: usableTranscript(attempt),
      studentText,
      currentStage: attempt.stage,
    },
    stream.signal,
  );

  for await (const event of events) {
    switch (event.type) {
      case "delta":
        stream.send({ type: "delta", text: event.text });
        break;
      case "error":
        stream.send({ type: "error", code: relayedCode(event.code) });
        return { outcome: relayedCode(event.code), stage: attempt.stage };
      case "done": {
        // Only the checked final reply is stored, never the raw deltas.
        const finalText = redactPii(event.finalText);
        const stage = laterStage(attempt.stage, event.stage);
        const partner = { role: "partner" as const, text: finalText, at: new Date() };
        await PracticeAttempt.updateOne(
          { _id: attempt._id, status: "active" },
          {
            $push: { transcript: { $each: [student, partner] } },
            $set: { stage },
            $inc: tokensOf(event.usage),
          },
        );
        await recordUsage(event.usage, new Date());
        stream.send({ type: "done", stage, turnsLeft, finalText });
        if (turnsLeft === 0) stream.send({ type: "ended", reason: "turn_limit" });
        return { outcome: "done", stage, usage: event.usage };
      }
      case "redirect": {
        const endedByGuard = attempt.guardFlags + 1 >= LIMITS.guardFlagLimit;
        const partner = { role: "partner" as const, text: event.text, at: new Date() };
        await PracticeAttempt.updateOne(
          { _id: attempt._id, status: "active" },
          {
            $push: {
              transcript: {
                $each: [
                  { ...student, flagged: true },
                  { ...partner, flagged: true },
                ],
              },
            },
            $inc: { guardFlags: 1, ...tokensOf(event.usage) },
            ...(endedByGuard ? { $set: { status: "ended_by_guard", endedAt: new Date() } } : {}),
          },
        );
        await recordUsage(event.usage, new Date());
        stream.send({ type: "redirect", text: event.text });
        if (endedByGuard) stream.send({ type: "ended", reason: "guard_limit" });
        else if (turnsLeft === 0) stream.send({ type: "ended", reason: "turn_limit" });
        return {
          outcome: endedByGuard ? "guard_limit" : "redirect",
          stage: attempt.stage,
          usage: event.usage,
        };
      }
    }
  }
  // The stream ended without a result.
  throw new UpstreamError();
}

/**
 * Runs one locked turn: redacts the student's text, relays the coach's stream, and stores the
 * outcome. A client that leaves mid-reply aborts the coach call and nothing is stored. The lock
 * is always released; the log line holds ids, stage, tokens, and the outcome code, never text.
 */
export async function runTurn(ctx: TurnContext, lock: TurnLock, text: string): Promise<void> {
  const attemptId = lock.attempt._id.toString();
  let result: TurnOutcome = { outcome: "error", stage: lock.attempt.stage };
  try {
    result = await relayTurn(ctx, lock, redactTurn(text));
  } catch (error) {
    if (ctx.stream.signal.aborted) {
      result = { ...result, outcome: "aborted" };
    } else {
      const code = error instanceof AppError ? error.code : "internal_error";
      if (!(error instanceof AppError)) {
        // The name only: error messages can quote stored data.
        const errorName = error instanceof Error ? error.name : typeof error;
        ctx.log.error({ attemptId, errorName }, "turn failed");
      }
      result = { ...result, outcome: code };
      ctx.stream.send({ type: "error", code });
    }
  } finally {
    await releaseTurnLock(lock);
  }
  ctx.log.info(
    {
      attemptId,
      stage: result.stage,
      outcome: result.outcome,
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
    },
    "practice turn finished",
  );
}
