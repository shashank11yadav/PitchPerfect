import mongoose from "mongoose";
import type { Page, PageQuery, StudentApplicationView } from "@pitchperfect/shared";
import { toStudentApplicationView } from "../../db/mappers.js";
import { Application, Company, Job, PracticeAttempt } from "../../db/models/index.js";
import { ConflictError, NotFoundError, ValidationError } from "../../errors.js";
import { isDuplicateKey } from "../auth/service.js";
import { findListedJob } from "../jobs/service.js";
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

async function listedSlug(jobId: mongoose.Types.ObjectId): Promise<string | null> {
  return (await listedSlugs([jobId])).get(jobId.toString()) ?? null;
}

async function viewsOf(applications: ApplicationDoc[]): Promise<StudentApplicationView[]> {
  const slugs = await listedSlugs(applications.map((application) => application.jobId));
  return applications.map((application) =>
    toStudentApplicationView(application, slugs.get(application.jobId.toString()) ?? null),
  );
}

/** The attempt must be the student's own and finished; anyone else's looks like it doesn't exist. */
async function assertShareable(studentId: string, attemptId: string): Promise<void> {
  const attempt = await PracticeAttempt.findOne({ _id: attemptId, studentId })
    .select("status")
    .lean();
  if (!attempt) throw new NotFoundError();
  if (attempt.status !== "completed") {
    throw new ValidationError({
      sharedAttemptId: "Finish that practice session before sharing it",
    });
  }
}

export type ApplyResult =
  { created: true; application: StudentApplicationView } | { created: false };

/**
 * Applies to a listed job. The upsert is atomic: with parallel requests exactly one inserts and the
 * rest get `created: false`. An existing application of any status, withdrawn included, counts, so
 * a student can't re-apply after withdrawing.
 */
export async function applyToJob(
  studentId: string,
  jobId: string,
  sharedAttemptId?: string,
): Promise<ApplyResult> {
  const { job, company } = await findListedJob({ _id: jobId });
  if (sharedAttemptId !== undefined) await assertShareable(studentId, sharedAttemptId);

  const now = new Date();
  try {
    const result = await Application.findOneAndUpdate(
      { jobId, studentId },
      {
        $setOnInsert: {
          status: "applied",
          closedReason: null,
          savedByEmployer: false,
          jobSnapshot: { title: job.title, companyName: company.name },
          ...(sharedAttemptId === undefined ? {} : { sharedAttemptId }),
          // Set by hand: automatic timestamps would also touch `updatedAt` on an existing one.
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: "after", includeResultMetadata: true, timestamps: false },
    );
    if (result.lastErrorObject?.updatedExisting || !result.value) return { created: false };
    return {
      created: true,
      application: toStudentApplicationView(result.value, job.slug),
    };
  } catch (error) {
    // A parallel request inserted between our match and our insert.
    if (isDuplicateKey(error, "jobId")) return { created: false };
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

/** Withdraws the student's own application (404 for anyone else's) and unshares any scorecard. */
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
    { $set: { status: application.status }, $unset: { sharedAttemptId: "", interview: "" } },
    { returnDocument: "after" },
  ).lean();
  if (!updated)
    throw new ConflictError("conflict", "That application just changed. Refresh and try again");
  return toStudentApplicationView(updated, await listedSlug(updated.jobId));
}
