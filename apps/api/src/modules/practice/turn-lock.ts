import mongoose from "mongoose";
import { PracticeAttempt } from "../../db/models/index.js";

/** Longer than the coach call timeout (35 s), so a live turn never loses its lock. */
export const TURN_LOCK_MS = 45_000;

export type LockedAttempt = NonNullable<Awaited<ReturnType<typeof lockAttempt>>>;

function lockAttempt(attemptId: string, studentId: string, now: Date, until: Date) {
  return PracticeAttempt.findOneAndUpdate(
    {
      _id: attemptId,
      studentId,
      status: "active",
      $or: [{ turnLockUntil: null }, { turnLockUntil: mongoose.trusted({ $lt: now }) }],
    },
    { $set: { turnLockUntil: until } },
    { returnDocument: "after" },
  ).select("+scenarioPrivate");
}

export interface TurnLock {
  attempt: LockedAttempt;
  /** The lock's own expiry; only the holder that set it can release it. */
  until: Date;
}

/**
 * Atomically claims the student's active attempt for one turn (or for scoring). Null when the
 * attempt is not theirs, not active, or held by a lock that has not expired yet.
 */
export async function acquireTurnLock(
  attemptId: string,
  studentId: string,
  now: Date,
): Promise<TurnLock | null> {
  const until = new Date(now.getTime() + TURN_LOCK_MS);
  const attempt = await lockAttempt(attemptId, studentId, now, until);
  return attempt ? { attempt, until } : null;
}

/** Releases the lock if it is still the one taken; a newer holder's lock is left alone. */
export async function releaseTurnLock({ attempt, until }: TurnLock): Promise<void> {
  await PracticeAttempt.updateOne(
    { _id: attempt._id, turnLockUntil: until },
    { $set: { turnLockUntil: null } },
  );
}
