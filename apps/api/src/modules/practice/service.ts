import { setTimeout as sleep } from "node:timers/promises";
import mongoose from "mongoose";
import {
  LIMITS,
  maySignalSelfHarm,
  type AttemptListQuery,
  type AttemptStatus,
  type AttemptSummary,
  type AttemptView,
  type ScenarioPrivate,
  type ScenarioPublic,
  type TranscriptEntry,
  type Page,
} from "@pitchperfect/shared";
import type { Config } from "../../config.js";
import { toAttemptSummary, toAttemptView } from "../../db/mappers.js";
import { Application, PracticeAttempt } from "../../db/models/index.js";
import type { PracticeAttemptAttrs } from "../../db/models/practice-attempt.js";
import { ConflictError, NotFoundError, PracticeUnavailableError } from "../../errors.js";
import { NotEnoughTurnsError, type CoachClient } from "../../services/coach-client.js";
import type { CoachProbe } from "../../services/coach-probe.js";
import { assertTokensLeft, chargeFailedCall, recordUsage } from "./quota.js";
import { estimateFailedScore } from "./text.js";
import {
  acquireTurnLock,
  releaseTurnLock,
  TURN_LOCK_MS,
  type LockedAttempt,
  type TurnLock,
} from "./turn-lock.js";

export interface PracticeDeps {
  config: Config;
  coach: CoachClient | undefined;
  /** The cached coach health, for telling the student which kind of partner they get. */
  coachProbe: CoachProbe;
}

const SESSION_MS = LIMITS.sessionSeconds * 1000;
/** Scoring needs at least this many unflagged student turns. */
const MIN_SCORED_TURNS = 2;
/** Scoring calls that cost tokens one session may make: the first and two retries. */
const MAX_SCORE_TRIES = 3;
const END_POLL_MS = 100;

/** Matches every attempt except a `starting` placeholder, which no one ever sees. */
export function visible() {
  const notStarting: { $ne: AttemptStatus } = { $ne: "starting" };
  return { status: mongoose.trusted(notStarting) };
}

export function coachOf(deps: PracticeDeps): CoachClient {
  if (!deps.coach) throw new PracticeUnavailableError();
  return deps.coach;
}

/** When the session stops taking turns (20 minutes after it started). */
export const sessionEndsAt = (attempt: Pick<PracticeAttemptAttrs, "startedAt">) =>
  new Date(attempt.startedAt.getTime() + SESSION_MS);

/** Student turns taken so far, flagged ones included: they used up a turn too. */
export const studentTurnsOf = (attempt: Pick<PracticeAttemptAttrs, "transcript">) =>
  attempt.transcript.filter((entry) => entry.role === "student").length;

/** The scenario as plain objects, for the coach. Only call with `scenarioPrivate` selected. */
export function scenarioOf(attempt: LockedAttempt): {
  scenarioPublic: ScenarioPublic;
  scenarioPrivate: ScenarioPrivate;
} {
  const { personaName, personaTitle, companyType, personality, openingLine } =
    attempt.scenarioPublic;
  return {
    scenarioPublic: { personaName, personaTitle, companyType, personality, openingLine },
    scenarioPrivate: {
      hiddenObjections: [...attempt.scenarioPrivate.hiddenObjections],
      winConditions: [...attempt.scenarioPrivate.winConditions],
    },
  };
}

/**
 * Unflagged entries only: guardrail redirects are never replayed or scored. A student line that
 * may signal self-harm is left out too, re-checked here so one stored before the rules caught it
 * is never scored, nor counted toward a score.
 */
const usableTranscript = (attempt: LockedAttempt): TranscriptEntry[] =>
  attempt.transcript
    .filter(
      (entry) => !entry.flagged && !(entry.role === "student" && maySignalSelfHarm(entry.text)),
    )
    .map((entry) => ({ role: entry.role, text: entry.text }));

export async function getAttempt(studentId: string, attemptId: string): Promise<AttemptView> {
  const attempt = await PracticeAttempt.findOne({ _id: attemptId, studentId, ...visible() }).lean();
  if (!attempt) throw new NotFoundError();
  return toAttemptView(attempt);
}

export async function listAttempts(
  studentId: string,
  { skill, page, pageSize }: AttemptListQuery,
): Promise<Page<AttemptSummary>> {
  const filter = { studentId, ...visible(), ...(skill ? { skill } : {}) };
  const [attempts, total] = await Promise.all([
    PracticeAttempt.find(filter)
      .sort({ startedAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    PracticeAttempt.countDocuments(filter),
  ]);
  return { items: attempts.map(toAttemptSummary), page, pageSize, total };
}

/** The student's own attempt's id; `404` for anyone else's, a missing one, or a placeholder. */
export async function ownAttemptId(studentId: string, attemptId: string) {
  const attempt = await PracticeAttempt.findOne({ _id: attemptId, studentId, ...visible() })
    .select("_id")
    .lean();
  if (!attempt) throw new NotFoundError();
  return attempt._id;
}

/** Deletes the student's own attempt and stops sharing it with any application. */
export async function deleteAttempt(studentId: string, attemptId: string): Promise<void> {
  const id = await ownAttemptId(studentId, attemptId);
  // Detach first, so a failure in between never leaves a share pointing at nothing.
  await Application.updateMany({ sharedAttemptId: id }, { $unset: { sharedAttemptId: "" } });
  await PracticeAttempt.deleteOne({ _id: id });
}

/** Closes a locked attempt with `status`; saving runs the scorecard validator. */
async function finish(
  attempt: LockedAttempt,
  status: "completed" | "abandoned",
): Promise<AttemptView> {
  attempt.status = status;
  attempt.endedAt = new Date();
  attempt.turnLockUntil = null;
  await attempt.save();
  return toAttemptView(attempt);
}

/**
 * Scores a locked attempt, or abandons it when there are fewer than two unflagged student turns.
 * A coach is needed only for the scoring itself.
 *
 * Scoring calls that cost tokens are counted on the attempt (`scoreTries`). The first is always
 * made, even once the student has used today's tokens: the turns already paid for the scorecard.
 * A retry after a failed call is made only while the student is under their daily token cap
 * (`429 token_limit_reached` otherwise, and the session stays active), and when the third try
 * fails the session is closed unscored. A call the coach turned away costs nothing and isn't
 * counted.
 */
async function scoreLocked(deps: PracticeDeps, lock: TurnLock): Promise<AttemptView> {
  const { attempt } = lock;
  const transcript = usableTranscript(attempt);
  if (
    transcript.filter((entry) => entry.role === "student").length < MIN_SCORED_TURNS ||
    attempt.scoreTries >= MAX_SCORE_TRIES
  ) {
    return finish(attempt, "abandoned");
  }
  if (attempt.scoreTries > 0) {
    try {
      await assertTokensLeft(deps.config, attempt.studentId.toString(), new Date());
    } catch (error) {
      await releaseTurnLock(lock);
      throw error;
    }
  }

  const request = { skill: attempt.skill, ...scenarioOf(attempt), transcript };
  let result;
  try {
    result = await coachOf(deps).score(request);
  } catch (error) {
    if (error instanceof NotEnoughTurnsError) return finish(attempt, "abandoned");
    // A failed score can still have used tokens.
    const charged = await chargeFailedCall(attempt.studentId, error, () =>
      estimateFailedScore(request),
    );
    if (charged) {
      attempt.scoreTries += 1;
      await PracticeAttempt.updateOne(
        { _id: attempt._id },
        {
          $inc: {
            "tokens.input": charged.inputTokens,
            "tokens.output": charged.outputTokens,
            scoreTries: 1,
          },
        },
      );
    }
    if (attempt.scoreTries >= MAX_SCORE_TRIES) await finish(attempt, "abandoned");
    // Still active, so the student can try ending again.
    else await releaseTurnLock(lock);
    throw error;
  }
  attempt.scorecard = result.scorecard;
  attempt.markModified("scorecard");
  attempt.tokens.input += result.usage.inputTokens;
  attempt.tokens.output += result.usage.outputTokens;
  attempt.scoreTries += 1;
  const view = await finish(attempt, "completed");
  await recordUsage(attempt.studentId, result.usage, new Date());
  return view;
}

/**
 * Ends a session: scores it when it has at least two unflagged student turns, else abandons it.
 * Idempotent: a session that already ended is returned as stored. While a turn or another end
 * holds the attempt's lock this waits for it, so concurrent ends score once.
 */
export async function endSession(
  deps: PracticeDeps,
  studentId: string,
  attemptId: string,
): Promise<AttemptView> {
  const deadline = Date.now() + TURN_LOCK_MS;
  for (;;) {
    const current = await PracticeAttempt.findOne({
      _id: attemptId,
      studentId,
      ...visible(),
    }).lean();
    if (!current) throw new NotFoundError();
    if (current.status !== "active") return toAttemptView(current);

    const lock = await acquireTurnLock(attemptId, studentId, new Date());
    if (lock) return scoreLocked(deps, lock);
    if (Date.now() >= deadline) {
      throw new ConflictError("conflict", "This session is busy. Try again in a moment");
    }
    await sleep(END_POLL_MS);
  }
}
