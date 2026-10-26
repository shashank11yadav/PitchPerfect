import { isSkillSlug, JOB_STATUSES, type JobStatus, type SkillSlug } from "@pitchperfect/shared";
import { PAGES_EXPORT } from "./pages-export";

/** Next's `searchParams` prop: the page URL's query, read on the server. */
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * One query value: the first if repeated, `undefined` if missing. The static export has no server
 * to read a query string on, so there every value is missing and its pages read the URL in the
 * browser instead.
 */
export async function queryValue(
  searchParams: SearchParams,
  key: string,
): Promise<string | undefined> {
  if (PAGES_EXPORT) return undefined;
  const value = (await searchParams)[key];
  return Array.isArray(value) ? value[0] : value;
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;

/** A route or query id that can name something in the api; anything else is simply not found. */
const isId = (value: string | undefined): value is string =>
  value !== undefined && OBJECT_ID.test(value);

/** `?page=` as a whole number from 1, or 1. */
export async function pageParam(searchParams: SearchParams): Promise<number> {
  const page = Number(await queryValue(searchParams, "page"));
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/** `?skill=` when it names a skill. */
export async function skillParam(searchParams: SearchParams): Promise<SkillSlug | undefined> {
  const skill = await queryValue(searchParams, "skill");
  return isSkillSlug(skill) ? skill : undefined;
}

/** `?jobId=` when it looks like an id; the api checks that the job is listed. */
export async function jobIdParam(searchParams: SearchParams): Promise<string | undefined> {
  const jobId = await queryValue(searchParams, "jobId");
  return isId(jobId) ? jobId : undefined;
}

/** Props of the pages under `/employer/jobs/[id]`. */
export interface JobPageProps {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}

/** The route's job id when it can name a job; undefined means "not found". */
export async function routeJobId(params: JobPageProps["params"]): Promise<string | undefined> {
  const { id } = await params;
  return isId(id) ? id : undefined;
}

/** `?status=` when it names a job status. */
export async function jobStatusParam(searchParams: SearchParams): Promise<JobStatus | undefined> {
  const status = await queryValue(searchParams, "status");
  return JOB_STATUSES.find((known) => known === status);
}

/** `?application=` when it looks like an id; the list decides whether it's one of this job's. */
export async function applicationParam(searchParams: SearchParams): Promise<string | undefined> {
  const id = await queryValue(searchParams, "application");
  return isId(id) ? id : undefined;
}

/** `?created=` after a new job is saved: how it was saved. */
export async function createdParam(
  searchParams: SearchParams,
): Promise<"published" | "draft" | undefined> {
  const created = await queryValue(searchParams, "created");
  return created === "published" || created === "draft" ? created : undefined;
}
