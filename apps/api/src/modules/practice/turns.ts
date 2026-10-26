import {
  LIMITS,
  redactPii,
  redactTurn,
  STAGES,
  type CoachTurnRequest,
  type EndedReason,
  type Stage,
  type Usage,
} from "@pitchperfect/shared";
import { PracticeAttempt } from "../../db/models/index.js";
import {
  AppError,
  ConflictError,
  NotFoundError,
  PracticeUnavailableError,
  UpstreamError,
} from "../../errors.js";
import type { CoachClient } from "../../services/coach-client.js";
import { recordUsage } from "./quota.js";
import { scenarioOf, sessionEndsAt, studentTurnsOf, visible } from "./service.js";
import type { PracticeStream } from "./sse.js";
import { estimateUnansweredTurn } from "./text.js";
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
    const current = await PracticeAttempt.findOne({ _id: attemptId, studentId, ...visible() })
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

/** The later of two stages: a session never moves backwards. */
const laterStage = (stored: Stage, next: Stage): Stage =>
  STAGES.indexOf(next) > STAGES.indexOf(stored) ? next : stored;

type TokenUsage = Pick<Usage, "inputTokens" | "outputTokens">;

const tokensOf = (usage: TokenUsage) => ({
  "tokens.input": usage.inputTokens,
  "tokens.output": usage.outputTokens,
});

/** The coach's turn-request transcript cap. */
const COACH_TRANSCRIPT_MAX = 40;

/**
 * History for the coach: every entry, flagged ones marked (the coach counts them as used turns
 * but never replays them to the model), keeping the most recent 40.
 */
function coachTranscript(attempt: TurnLock["attempt"]): CoachTurnRequest["transcript"] {
  return attempt.transcript
    .slice(-COACH_TRANSCRIPT_MAX)
    .map(({ role, text, flagged }) => (flagged ? { role, text, flagged } : { role, text }));
}

interface TurnContext {
  coach: CoachClient;
  log: TurnLog;
  stream: PracticeStream;
}

interface TurnOutcome {
  outcome: string;
  stage: Stage;
  usage?: TokenUsage;
}

interface TurnProgress {
  /** True once the coach has sent anything back. */
  started: boolean;
  /** True once the turn's outcome is stored; nothing more is charged after that. */
  stored: boolean;
}

async function relayTurn(
  { coach, stream }: TurnContext,
  { attempt }: TurnLock,
  request: CoachTurnRequest,
  progress: TurnProgress,
): Promise<TurnOutcome> {
  const turnsLeft = LIMITS.maxStudentTurns - (studentTurnsOf(attempt) + 1);
  const student = { role: "student" as const, text: request.studentText, at: new Date() };

  for await (const event of coach.turn(request, stream.signal)) {
    progress.started = true;
    switch (event.type) {
      case "delta":
        stream.send({ type: "delta", text: event.text });
        break;
      case "error":
        // Only codes the browser knows are passed on.
        throw event.code === "practice_unavailable"
          ? new PracticeUnavailableError()
          : new UpstreamError();
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
        progress.stored = true;
        await recordUsage(event.usage, new Date());
        stream.send({ type: "done", stage, turnsLeft, finalText });
        if (turnsLeft === 0) stream.send({ type: "ended", reason: "turn_limit" });
        return { outcome: "done", stage, usage: event.usage };
      }
      case "redirect": {
        // Every redirected turn is flagged; only a confirmed attack counts toward the limit.
        const text = redactPii(event.text);
        const guardFlags = event.strike ? 1 : 0;
        const endedByGuard = attempt.guardFlags + guardFlags >= LIMITS.guardFlagLimit;
        const partner = { role: "partner" as const, text, at: new Date() };
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
            $inc: { guardFlags, ...tokensOf(event.usage) },
            ...(endedByGuard ? { $set: { status: "ended_by_guard", endedAt: new Date() } } : {}),
          },
        );
        progress.stored = true;
        await recordUsage(event.usage, new Date());
        stream.send({ type: "redirect", text });
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
 * A turn the coach started but never finished still costs a turn and tokens, so leaving
 * mid-reply can't be used to get around the turn limit, quota, or budget. The student's text is
 * kept flagged (never replayed or scored), with no partner reply, and the usage is estimated.
 */
async function chargeUnanswered(
  { attempt }: TurnLock,
  request: CoachTurnRequest,
): Promise<TokenUsage> {
  const usage = estimateUnansweredTurn(request);
  await PracticeAttempt.updateOne(
    { _id: attempt._id, status: "active" },
    {
      $push: {
        transcript: { role: "student", text: request.studentText, at: new Date(), flagged: true },
      },
      $inc: tokensOf(usage),
    },
  );
  await recordUsage(usage, new Date());
  return usage;
}

/**
 * Runs one locked turn: redacts the student's text, relays the coach's stream, and stores the
 * outcome. When the client leaves or the coach fails after it started, the turn is charged (see
 * `chargeUnanswered`); a coach that refuses the call outright costs nothing. The lock is always
 * released, and the log line holds ids, stage, tokens, and the outcome code, never text.
 */
export async function runTurn(ctx: TurnContext, lock: TurnLock, text: string): Promise<void> {
  const { attempt } = lock;
  const attemptId = attempt._id.toString();
  const request: CoachTurnRequest = {
    skill: attempt.skill,
    ...scenarioOf(attempt),
    transcript: coachTranscript(attempt),
    studentText: redactTurn(text),
    currentStage: attempt.stage,
  };
  const progress: TurnProgress = { started: false, stored: false };
  let result: TurnOutcome = { outcome: "error", stage: attempt.stage };
  try {
    result = await relayTurn(ctx, lock, request, progress);
  } catch (error) {
    const aborted = ctx.stream.signal.aborted;
    const code = aborted ? "aborted" : error instanceof AppError ? error.code : "internal_error";
    if (!aborted && !(error instanceof AppError)) {
      // The name only: error messages can quote stored data.
      const errorName = error instanceof Error ? error.name : typeof error;
      ctx.log.error({ attemptId, errorName }, "turn failed");
    }
    const charged = (aborted || progress.started) && !progress.stored;
    const usage = charged ? await chargeUnanswered(lock, request) : undefined;
    result = { ...result, outcome: code, usage };
    // A turn the coach had started is counted (charged here, or already stored); a refusal before
    // it started is not, and the browser keeps its turn.
    if (!aborted) ctx.stream.send({ type: "error", code, counted: progress.started });
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
