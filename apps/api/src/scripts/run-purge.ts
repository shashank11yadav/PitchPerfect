import mongoose from "mongoose";
import { LIMITS } from "@pitchperfect/shared";
import { Application, AuthToken, PracticeAttempt } from "../db/models/index.js";

/** A session still `active` this long after it started can never finish: its turn limit plus an hour. */
const STALE_ACTIVE_MS = LIMITS.sessionSeconds * 1000 + 60 * 60 * 1000;
/** A session start that has been planning this long crashed; its placeholder is removed. */
const STALE_PLACEHOLDER_MS = 5 * 60 * 1000;

export interface PurgeResult {
  attemptsDeleted: number;
  tokensDeleted: number;
  attemptsAbandoned: number;
  /** Applications that pointed at a deleted attempt and no longer share a scorecard. */
  sharesCleared: number;
  /** `starting` placeholders left behind by session starts that never finished. */
  placeholdersDeleted: number;
}

/**
 * The backstop for the TTL indexes: removes expired attempts and spent or expired tokens, frees
 * applications from attempts that are gone, marks long-dead `active` sessions abandoned, and removes
 * placeholders of session starts that never finished.
 * Runs on the open Mongoose connection; safe to repeat.
 */
export async function runPurge(now: Date): Promise<PurgeResult> {
  const expired = await PracticeAttempt.find({ expiresAt: mongoose.trusted({ $lt: now }) })
    .select("_id")
    .lean();
  const expiredIds = expired.map((attempt) => attempt._id);
  // Detach first, so a crash in between never leaves a share pointing at nothing.
  const detached = await Application.updateMany(
    { sharedAttemptId: mongoose.trusted({ $in: expiredIds }) },
    { $unset: { sharedAttemptId: "" } },
  );
  const attempts = await PracticeAttempt.deleteMany({ _id: mongoose.trusted({ $in: expiredIds }) });

  const tokens = await AuthToken.deleteMany({
    $or: [
      { expiresAt: mongoose.trusted({ $lt: now }) },
      { usedAt: mongoose.trusted({ $ne: null }) },
    ],
  });

  const abandoned = await PracticeAttempt.updateMany(
    {
      status: "active",
      startedAt: mongoose.trusted({ $lt: new Date(now.getTime() - STALE_ACTIVE_MS) }),
    },
    { status: "abandoned", turnLockUntil: null },
  );

  const placeholders = await PracticeAttempt.deleteMany({
    status: "starting",
    startedAt: mongoose.trusted({ $lt: new Date(now.getTime() - STALE_PLACEHOLDER_MS) }),
  });

  return {
    attemptsDeleted: attempts.deletedCount,
    tokensDeleted: tokens.deletedCount,
    attemptsAbandoned: abandoned.modifiedCount,
    sharesCleared: detached.modifiedCount,
    placeholdersDeleted: placeholders.deletedCount,
  };
}
