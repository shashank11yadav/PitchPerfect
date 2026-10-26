import mongoose, { type QueryFilter, type Types } from "mongoose";
import { DAY_MS, LIMITS } from "@pitchperfect/shared";
import type { ApplicationAttrs } from "../../db/models/application.js";
import { Application, StudentProfile } from "../../db/models/index.js";
import { copyResume, deleteResume } from "../../services/files.js";
import { anyOf, OPEN_STATUSES } from "./closing.js";

const GRACE_MS = LIMITS.resumeAccessGraceDays * DAY_MS;

/** Holds its own résumé copy (null and missing don't). */
const holdsCopy = { resumeFileId: mongoose.trusted({ $type: "objectId" as const }) };

/**
 * A copy of the student's current résumé for an application they are making, so the employer
 * gets the version they applied with. Null when they have none.
 */
export async function copyProfileResume(studentId: string): Promise<Types.ObjectId | null> {
  const profile = await StudentProfile.findOne({ userId: studentId })
    .select("userId resumeFileId")
    .lean();
  if (!profile?.resumeFileId) return null;
  return copyResume(profile.resumeFileId, profile.userId);
}

type AccessFields = Pick<ApplicationAttrs, "status" | "endedAt" | "updatedAt">;

/**
 * Whether the employer may open the application's résumé: while it is open (an open application
 * is always on an active job, since archiving closes them), then for the grace period after it was
 * decided or closed. Never once the student withdrew. Applications that ended before `endedAt`
 * existed count from their last change.
 */
export function resumeAccessOpen(application: AccessFields, now = new Date()): boolean {
  if (application.status === "withdrawn") return false;
  if (OPEN_STATUSES.includes(application.status)) return true;
  const endedAt = application.endedAt ?? application.updatedAt;
  return now.getTime() - endedAt.getTime() < GRACE_MS;
}

/** The start of the window whose ended applications no longer share a résumé. */
const resumeAccessCutoff = (now: Date) => new Date(now.getTime() - GRACE_MS);

/**
 * The résumé file the application shares: its own copy, or for an application made before copies
 * existed, the student's current one.
 */
export function appliedResumeId(
  application: Pick<ApplicationAttrs, "resumeFileId">,
  profileResumeId: Types.ObjectId | null | undefined,
): Types.ObjectId | null {
  if (application.resumeFileId !== undefined) return application.resumeFileId;
  return profileResumeId ?? null;
}

/**
 * Drops the résumé copies of the matching applications and deletes their files. The applications
 * are detached first, so a crash in between never leaves one pointing at a deleted file. Returns
 * how many copies went. Safe to repeat.
 */
export async function removeResumeCopies(filter: QueryFilter<ApplicationAttrs>): Promise<number> {
  const held = await Application.find({ ...filter, ...holdsCopy })
    .select("resumeFileId")
    .lean();
  if (held.length === 0) return 0;
  await Application.updateMany(
    { _id: anyOf(held.map((application) => application._id)) },
    { $set: { resumeFileId: null } },
    { timestamps: false },
  );
  await Promise.all(
    held.flatMap((application) =>
      application.resumeFileId ? [deleteResume(application.resumeFileId)] : [],
    ),
  );
  return held.length;
}

/** Copies whose access window has passed: ended (not open) applications, past the grace period. */
export function expiredCopies(now: Date): QueryFilter<ApplicationAttrs> {
  const cutoff = mongoose.trusted({ $lt: resumeAccessCutoff(now) });
  return {
    status: mongoose.trusted({ $nin: OPEN_STATUSES }),
    $or: [{ endedAt: cutoff }, { endedAt: null, updatedAt: cutoff }],
  };
}
