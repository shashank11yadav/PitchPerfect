import { setTimeout as sleep } from "node:timers/promises";
import mongoose from "mongoose";
import {
  LIMITS,
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
import { recordUsage } from "./quota.js";
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
}

const SESSION_MS = LIMITS.sessionSeconds * 1000;
/** Scoring needs at least this many unflagged student turns. */
const MIN_SCORED_TURNS = 2;
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

/** Unflagged entries only: guardrail redirects are never replayed or scored. */
const usableTranscript = (attempt: LockedAttempt): TranscriptEntry[] =>
  attempt.transcript
    .filter((entry) => !entry.flagged)
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

/** Deletes the student's own attempt and stops sharing it with any application. */
export async function deleteAttempt(studentId: string, attemptId: string): Promise<void> {
  const attempt = await PracticeAttempt.findOne({ _id: attemptId, studentId, ...visible() })
    .select("_id")
    .lean();
  if (!attempt) throw new NotFoundError();
  // Detach first, so a failure in between never leaves a share pointing at nothing.
  await Application.updateMany(
    { sharedAttemptId: attempt._id },
    { $unset: { sharedAttemptId: "" } },
  );
  await PracticeAttempt.deleteOne({ _id: attempt._id });
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
 */
async function scoreLocked(deps: PracticeDeps, lock: TurnLock): Promise<AttemptView> {
  const { attempt } = lock;
  const transcript = usableTranscript(attempt);
  if (transcript.filter((entry) => entry.role === "student").length < MIN_SCORED_TURNS) {
    return finish(attempt, "abandoned");
  }

  let result;
  try {
    result = await coachOf(deps).score({
      skill: attempt.skill,
      ...scenarioOf(attempt),
      transcript,
    });
  } catch (error) {
    if (error instanceof NotEnoughTurnsError) return finish(attempt, "abandoned");
    // Still active, so the student can try ending again.
    await releaseTurnLock(lock);
    throw error;
  }
  attempt.scorecard = result.scorecard;
  attempt.markModified("scorecard");
  attempt.tokens.input += result.usage.inputTokens;
  attempt.tokens.output += result.usage.outputTokens;
  const view = await finish(attempt, "completed");
  await recordUsage(result.usage, new Date());
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
