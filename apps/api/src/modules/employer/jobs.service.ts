import { randomInt } from "node:crypto";
import mongoose from "mongoose";
import {
  slugify,
  type EmployerJob,
  type EmployerJobListQuery,
  type EmployerJobSummary,
  type JobInput,
  type JobStatus,
  type JobUpdate,
  type Page,
} from "@pitchperfect/shared";
import { toEmployerJob, toEmployerJobSummary } from "../../db/mappers.js";
import { Application, Job, PracticeAttempt, SavedJob } from "../../db/models/index.js";
import { ConflictError, NotFoundError, ValidationError } from "../../errors.js";
import { htmlToPlainText, sanitizeJobHtml } from "../../services/html-sanitizer.js";
import type { LinkingMailer, MailFailureLog } from "../../services/mailer.js";
import { isDuplicateKey } from "../auth/service.js";
import { closeOpenApplications } from "../applications/closing.js";
import type { CompanyDoc, JobDoc } from "./ownership.js";

const SLUG_SUFFIX_SPACE = 36 ** 6;
const slugSuffix = () => randomInt(SLUG_SUFFIX_SPACE).toString(36).padStart(6, "0");

/** Sanitizes employer HTML; a description with no text left after that is not a description. */
function cleanDescription(html: string): string {
  const clean = sanitizeJobHtml(html);
  if (htmlToPlainText(clean) === "") {
    throw new ValidationError({ descriptionHtml: "Add a job description" });
  }
  return clean;
}

async function applicantCounts(jobIds: mongoose.Types.ObjectId[]): Promise<Map<string, number>> {
  const rows = await Application.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    { $match: { jobId: { $in: jobIds } } },
    { $group: { _id: "$jobId", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id.toString(), row.count]));
}

async function applicantCount(jobId: mongoose.Types.ObjectId): Promise<number> {
  return Application.countDocuments({ jobId });
}

export async function viewJob(job: JobDoc): Promise<EmployerJob> {
  return toEmployerJob(job, await applicantCount(job._id));
}

export async function createJob(company: CompanyDoc, input: JobInput): Promise<EmployerJob> {
  const { status = "draft", descriptionHtml, ...content } = input;
  const fields = {
    ...content,
    descriptionHtml: cleanDescription(descriptionHtml),
    companyId: company._id,
    status,
    ...(status === "active" && { publishedAt: new Date() }),
  };
  const create = () => Job.create({ ...fields, slug: slugify(input.title, slugSuffix()) });
  try {
    return toEmployerJob(await create(), 0);
  } catch (error) {
    // A random suffix collision is unlikely; one retry with a new suffix settles it.
    if (!isDuplicateKey(error, "slug")) throw error;
    return toEmployerJob(await create(), 0);
  }
}

/** The company's jobs, newest first, optionally of one status. */
export async function listJobs(
  company: CompanyDoc,
  { status, page, pageSize }: EmployerJobListQuery,
): Promise<Page<EmployerJobSummary>> {
  const filter = { companyId: company._id, ...(status && { status }) };
  const [jobs, total] = await Promise.all([
    Job.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Job.countDocuments(filter),
  ]);
  const counts = await applicantCounts(jobs.map((job) => job._id));
  return {
    items: jobs.map((job) => toEmployerJobSummary(job, counts.get(job._id.toString()) ?? 0)),
    page,
    pageSize,
    total,
  };
}

/** Edits content fields only; the slug, owner, status, and publish date never change here. */
export async function updateJob(job: JobDoc, patch: JobUpdate): Promise<EmployerJob> {
  const { descriptionHtml, ...fields } = patch;
  const set = {
    ...fields,
    ...(descriptionHtml !== undefined && { descriptionHtml: cleanDescription(descriptionHtml) }),
  };
  const updated = await Job.findOneAndUpdate(
    { _id: job._id, companyId: job.companyId },
    { $set: set },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (!updated) throw new NotFoundError();
  return viewJob(updated);
}

function invalidStatusChange(from: JobStatus, to: JobStatus): ValidationError {
  return new ValidationError(
    undefined,
    `A job that is ${from} can't be changed to ${to}`,
    "invalid_transition",
  );
}

/**
 * Publishes (setting `publishedAt` the first time only), reactivates, or archives. Archiving
 * closes every open application and emails each student once; closed ones stay closed if the job
 * is reactivated. Going back to draft is not allowed, so a draft never has applicants.
 */
export async function changeJobStatus(
  mail: LinkingMailer,
  log: MailFailureLog,
  company: CompanyDoc,
  job: JobDoc,
  to: JobStatus,
): Promise<EmployerJob> {
  if (to === "draft" && job.status !== "draft") throw invalidStatusChange(job.status, to);

  let current = job;
  if (job.status !== to) {
    const updated = await Job.findOneAndUpdate(
      { _id: job._id, companyId: company._id, status: job.status },
      {
        $set: {
          status: to,
          ...(to === "active" && job.publishedAt == null && { publishedAt: new Date() }),
        },
      },
      { returnDocument: "after" },
    ).lean();
    if (!updated) {
      throw new ConflictError("conflict", "That job just changed. Refresh and try again");
    }
    current = updated;
  }
  // Also when it was already archived, so a run that failed half-way can be finished by repeating it.
  if (to === "archived") {
    await closeOpenApplications(mail, log, company, [current], "job_archived");
  }
  return viewJob(current);
}

/** Deletes a job nobody has applied to, along with students' saves of it. Otherwise archive it. */
export async function deleteJob(job: JobDoc): Promise<void> {
  if (await Application.exists({ jobId: job._id })) {
    throw new ConflictError("conflict", "This job has applicants. Archive it instead");
  }
  await Job.deleteOne({ _id: job._id, companyId: job.companyId });
  await Promise.all([
    SavedJob.deleteMany({ jobId: job._id }),
    PracticeAttempt.updateMany({ jobId: job._id }, { $unset: { jobId: 1 } }),
  ]);
}
