import mongoose, { type PipelineStage } from "mongoose";
import type {
  JobListQuery,
  Page,
  PageQuery,
  PublicCompany,
  PublicJob,
  PublicJobSummary,
} from "@pitchperfect/shared";
import { toPublicCompany, toPublicJob, toPublicJobSummary } from "../../db/mappers.js";
import { Company, Job, SavedJob } from "../../db/models/index.js";
import type { CompanyAttrs } from "../../db/models/company.js";
import type { JobAttrs } from "../../db/models/job.js";
import { NotFoundError } from "../../errors.js";
import { isDuplicateKey } from "../auth/service.js";

type JobWithCompany = JobAttrs & {
  _id: mongoose.Types.ObjectId;
  company: CompanyAttrs & { _id: mongoose.Types.ObjectId };
};

/** Joins each job to its company and drops the ones whose company is suspended. */
const withVisibleCompany: PipelineStage[] = [
  {
    $lookup: {
      from: Company.collection.name,
      localField: "companyId",
      foreignField: "_id",
      as: "company",
    },
  },
  { $unwind: "$company" },
  { $match: { "company.verification": { $ne: "suspended" } } },
];

/** Sorts, slices, and counts in one round trip, so `total` matches the unsliced result. */
async function pageOfJobs(
  run: (pipeline: PipelineStage[]) => Promise<unknown[]>,
  pipeline: PipelineStage[],
  sort: Record<string, 1 | -1>,
  { page, pageSize }: PageQuery,
): Promise<Page<PublicJobSummary>> {
  const [result] = (await run([
    ...pipeline,
    {
      $facet: {
        items: [{ $sort: sort }, { $skip: (page - 1) * pageSize }, { $limit: pageSize }],
        total: [{ $count: "count" }],
      },
    },
  ])) as [{ items: JobWithCompany[]; total: { count: number }[] }];
  return {
    items: result.items.map((job) => toPublicJobSummary(job, job.company)),
    page,
    pageSize,
    total: result.total[0]?.count ?? 0,
  };
}

/** Active jobs of companies that aren't suspended; text-ranked when `q` is given, else newest first. */
export function listPublicJobs(query: JobListQuery): Promise<Page<PublicJobSummary>> {
  const { q, workplace, employmentType, page, pageSize } = query;
  const search = q !== undefined && q !== "";
  const pipeline: PipelineStage[] = [
    {
      $match: {
        status: "active",
        ...(search ? { $text: { $search: q } } : {}),
        ...(workplace ? { workplace } : {}),
        ...(employmentType ? { employmentType } : {}),
      },
    },
    ...(search ? [{ $addFields: { score: { $meta: "textScore" as const } } }] : []),
    ...withVisibleCompany,
  ];
  return pageOfJobs(
    (stages) => Job.aggregate(stages),
    pipeline,
    search ? { score: -1, publishedAt: -1, _id: -1 } : { publishedAt: -1, _id: -1 },
    { page, pageSize },
  );
}

/** An active job and its company, or 404 when it's missing, not active, or its company is suspended. */
export async function findListedJob(filter: { _id: string } | { slug: string }) {
  const job = await Job.findOne({ ...filter, status: "active" }).lean();
  const company = job ? await Company.findById(job.companyId).lean() : null;
  if (!job || !company || company.verification === "suspended") throw new NotFoundError();
  return { job, company };
}

export async function getPublicJobBySlug(
  slug: string,
): Promise<{ job: PublicJob; company: PublicCompany }> {
  const { job, company } = await findListedJob({ slug });
  return { job: toPublicJob(job, company), company: toPublicCompany(company) };
}

/** Saving twice is fine: the second request changes nothing. */
export async function saveJob(studentId: string, jobId: string): Promise<void> {
  await findListedJob({ _id: jobId });
  try {
    await SavedJob.updateOne(
      { studentId, jobId },
      { $setOnInsert: { studentId, jobId } },
      { upsert: true },
    );
  } catch (error) {
    // Two parallel saves can both try to insert; the loser's job is already saved.
    if (!isDuplicateKey(error, "jobId")) throw error;
  }
}

export async function unsaveJob(studentId: string, jobId: string): Promise<void> {
  await SavedJob.deleteOne({ studentId, jobId });
}

/** The student's saved jobs, most recently saved first; jobs that are no longer listed are left out. */
export function listSavedJobs(
  studentId: string,
  query: PageQuery,
): Promise<Page<PublicJobSummary>> {
  const pipeline: PipelineStage[] = [
    { $match: { studentId: new mongoose.Types.ObjectId(studentId) } },
    {
      $lookup: {
        from: Job.collection.name,
        localField: "jobId",
        foreignField: "_id",
        as: "job",
      },
    },
    { $unwind: "$job" },
    { $match: { "job.status": "active" } },
    { $replaceRoot: { newRoot: { $mergeObjects: ["$job", { savedAt: "$createdAt" }] } } },
    ...withVisibleCompany,
  ];
  return pageOfJobs(
    (stages) => SavedJob.aggregate(stages),
    pipeline,
    { savedAt: -1, _id: -1 },
    query,
  );
}
