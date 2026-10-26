import mongoose from "mongoose";
import type {
  ApplicationStatus,
  Page,
  PageQuery,
  StudentApplicationView,
} from "@pitchperfect/shared";
import { sharesScorecard, toStudentApplicationView } from "../../db/mappers.js";
import type { ApplicationAttrs } from "../../db/models/application.js";
import { Application, Company, Job, PracticeAttempt } from "../../db/models/index.js";
import { ConflictError, NotFoundError, ValidationError } from "../../errors.js";
import { deleteResume } from "../../services/files.js";
import { isDuplicateKey } from "../auth/service.js";
import { findListedJob } from "../jobs/service.js";
import { copyProfileResume, removeResumeCopies } from "./resume-copies.js";
import { transitionApplication } from "./transitions.js";

type ApplicationDoc = Parameters<typeof toStudentApplicationView>[0];

/** The slug of each job that is still publicly listed (active, company not suspended). */
async function listedSlugs(jobIds: mongoose.Types.ObjectId[]): Promise<Map<string, string>> {
  const jobs = await Job.find({ _id: mongoose.trusted({ $in: jobIds }), status: "active" })
    .select("slug companyId")
    .lean();
  const suspended = new Set(
    (
      await Company.find({
        _id: mongoose.trusted({ $in: jobs.map((job) => job.companyId) }),
        verification: "suspended",
      })
        .select("_id")
        .lean()
    ).map((company) => company._id.toString()),
  );
  return new Map(
    jobs
      .filter((job) => !suspended.has(job.companyId.toString()))
      .map((job) => [job._id.toString(), job.slug]),
  );
}

/** Ids of the shared attempts that still exist and are completed (a TTL delete shares nothing). */
export async function completedAttemptIds(
  applications: readonly Pick<ApplicationAttrs, "sharedAttemptId">[],
): Promise<Set<string>> {
  const ids = applications.flatMap((application) => application.sharedAttemptId ?? []);
  if (ids.length === 0) return new Set();
  const attempts = await PracticeAttempt.find({
    _id: mongoose.trusted({ $in: ids }),
    status: "completed",
  })
    .select("_id")
    .lean();
  return new Set(attempts.map((attempt) => attempt._id.toString()));
}

async function viewsOf(applications: ApplicationDoc[]): Promise<StudentApplicationView[]> {
  const [slugs, completed] = await Promise.all([
    listedSlugs(applications.map((application) => application.jobId)),
    completedAttemptIds(applications),
  ]);
  return applications.map((application) =>
    toStudentApplicationView(
      application,
      slugs.get(application.jobId.toString()) ?? null,
      sharesScorecard(application, completed),
    ),
  );
}

async function viewOf(application: ApplicationDoc): Promise<StudentApplicationView> {
  const [view] = await viewsOf([application]);
  if (!view) throw new NotFoundError();
  return view;
}

/**
 * The attempt must be the student's own and finished; anyone else's looks like it doesn't exist.
 * `field` names the body field in the validation error.
 */
async function assertShareable(studentId: string, attemptId: string, field: string): Promise<void> {
  const attempt = await PracticeAttempt.findOne({ _id: attemptId, studentId })
    .select("status")
    .lean();
  if (!attempt) throw new NotFoundError();
  if (attempt.status !== "completed") {
    throw new ValidationError({ [field]: "Finish that practice session before sharing it" });
  }
}

export type ApplyResult =
  { created: true; application: StudentApplicationView } | { created: false };

/**
 * Applies to a listed job with a copy of the student's current résumé, which the application
 * keeps when the student later uploads another. The copy is removed again if no application was
 * created.
 */
export async function applyToJob(
  studentId: string,
  jobId: string,
  sharedAttemptId?: string,
): Promise<ApplyResult> {
  const { job, company } = await findListedJob({ _id: jobId });
  if (sharedAttemptId !== undefined) {
    await assertShareable(studentId, sharedAttemptId, "sharedAttemptId");
  }
  // Saves copying the résumé for a repeated click; the upsert below still decides races.
  if (await Application.exists({ jobId, studentId })) return { created: false };

  const resumeFileId = await copyProfileResume(studentId);
  let inserted: ApplicationDoc | null = null;
  try {
    inserted = await insertApplication(studentId, { job, company }, resumeFileId, sharedAttemptId);
  } finally {
    if (!inserted && resumeFileId) await deleteResume(resumeFileId);
  }
  return inserted ? { created: true, application: await viewOf(inserted) } : { created: false };
}

/**
 * The new application, or null when one already exists. The upsert is atomic: with parallel
 * requests exactly one inserts. An existing application of any status, withdrawn included,
 * counts, so a student can't re-apply after withdrawing.
 */
async function insertApplication(
  studentId: string,
  { job, company }: Awaited<ReturnType<typeof findListedJob>>,
  resumeFileId: mongoose.Types.ObjectId | null,
  sharedAttemptId?: string,
): Promise<ApplicationDoc | null> {
  const now = new Date();
  try {
    const result = await Application.findOneAndUpdate(
      { jobId: job._id, studentId },
      {
        $setOnInsert: {
          status: "applied",
          closedReason: null,
          savedByEmployer: false,
          jobSnapshot: { title: job.title, companyName: company.name },
          ...(sharedAttemptId === undefined ? {} : { sharedAttemptId }),
          resumeFileId,
          // Set by hand: automatic timestamps would also touch `updatedAt` on an existing one.
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: "after", includeResultMetadata: true, timestamps: false },
    );
    if (result.lastErrorObject?.updatedExisting) return null;
    return result.value;
  } catch (error) {
    // A parallel request inserted between our match and our insert.
    if (isDuplicateKey(error, "jobId")) return null;
    throw error;
  }
}

export async function listStudentApplications(
  studentId: string,
  { page, pageSize }: PageQuery,
): Promise<Page<StudentApplicationView>> {
  const [applications, total] = await Promise.all([
    Application.find({ studentId })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Application.countDocuments({ studentId }),
  ]);
  return { items: await viewsOf(applications), page, pageSize, total };
}

/**
 * Withdraws the student's own application (404 for anyone else's), unshares any scorecard, and
 * deletes the application's résumé copy.
 */
export async function withdrawApplication(
  studentId: string,
  applicationId: string,
): Promise<StudentApplicationView> {
  const application = await Application.findOne({ _id: applicationId, studentId }).lean();
  if (!application) throw new NotFoundError();
  const from = application.status;
  transitionApplication(application, "withdrawn", "student");

  // Guarded on the status we checked, so an employer's change in between isn't overwritten.
  const updated = await Application.findOneAndUpdate(
    { _id: applicationId, studentId, status: from },
    {
      $set: { status: application.status, endedAt: new Date() },
      $unset: { sharedAttemptId: "", interview: "" },
    },
    { returnDocument: "after" },
  ).lean();
  if (!updated)
    throw new ConflictError("conflict", "That application just changed. Refresh and try again");
  await removeResumeCopies({ _id: updated._id });
  return viewOf(updated);
}

/** A withdrawn or closed application is over; it no longer shares anything with the employer. */
const NO_SHARING: readonly ApplicationStatus[] = ["withdrawn", "closed"];

/**
 * Shares one of the student's completed attempts with their own application (404 for anyone
 * else's), replacing any earlier one; `null` stops sharing. A withdrawn or closed application is
 * `400 invalid_transition`.
 */
export async function shareScorecard(
  studentId: string,
  applicationId: string,
  attemptId: string | null,
): Promise<StudentApplicationView> {
  const application = await Application.findOne({ _id: applicationId, studentId })
    .select("status")
    .lean();
  if (!application) throw new NotFoundError();
  const notOpen = () =>
    new ValidationError(
      undefined,
      `A ${application.status} application can't share a scorecard`,
      "invalid_transition",
    );
  if (NO_SHARING.includes(application.status)) throw notOpen();
  if (attemptId !== null) await assertShareable(studentId, attemptId, "attemptId");

  // Guarded on the status, so a withdrawal or closing in between wins.
  const updated = await Application.findOneAndUpdate(
    { _id: applicationId, studentId, status: mongoose.trusted({ $nin: NO_SHARING }) },
    attemptId === null
      ? { $unset: { sharedAttemptId: "" } }
      : { $set: { sharedAttemptId: attemptId } },
    { returnDocument: "after" },
  ).lean();
  if (!updated) throw notOpen();
  return viewOf(updated);
}
