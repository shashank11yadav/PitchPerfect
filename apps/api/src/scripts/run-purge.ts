import mongoose from "mongoose";
import { LIMITS } from "@pitchperfect/shared";
import { Application, AuthToken, PracticeAttempt } from "../db/models/index.js";
import { expiredCopies, removeResumeCopies } from "../modules/applications/resume-copies.js";
import { removeStalePlaceholders } from "../modules/practice/quota.js";

/** A session still `active` this long after it started can never finish: its turn limit plus an hour. */
const STALE_ACTIVE_MS = LIMITS.sessionSeconds * 1000 + 60 * 60 * 1000;
/**
 * A session start that has been planning this long crashed; its placeholder is removed and its
 * session given back.
 */
const STALE_PLACEHOLDER_MS = 5 * 60 * 1000;

export interface PurgeResult {
  attemptsDeleted: number;
  tokensDeleted: number;
  attemptsAbandoned: number;
  /** Applications that pointed at a deleted attempt and no longer share a scorecard. */
  sharesCleared: number;
  /** `starting` placeholders left behind by session starts that never finished. */
  placeholdersDeleted: number;
  /** Résumé copies of applications that ended longer ago than the employer's access window. */
  resumesRemoved: number;
}

/**
 * The backstop for the TTL indexes: removes expired attempts and spent or expired tokens, frees
 * applications from attempts that are gone, marks long-dead `active` sessions abandoned, removes
 * placeholders of session starts that never finished, giving their sessions back, and deletes
 * résumé copies employers can no longer open.
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

  const placeholdersDeleted = await removeStalePlaceholders(
    new Date(now.getTime() - STALE_PLACEHOLDER_MS),
  );

  const resumesRemoved = await removeResumeCopies(expiredCopies(now));

  return {
    attemptsDeleted: attempts.deletedCount,
    tokensDeleted: tokens.deletedCount,
    attemptsAbandoned: abandoned.modifiedCount,
    sharesCleared: detached.modifiedCount,
    placeholdersDeleted,
    resumesRemoved,
  };
}
