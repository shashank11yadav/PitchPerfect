import { JOB_STATUSES, type JobStatus } from "@pitchperfect/shared";

/** Next's `searchParams` for the employer pages. */
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function value(searchParams: SearchParams, key: string): Promise<string | undefined> {
  const raw = (await searchParams)[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

/** `?status=` when it names a job status. */
export async function jobStatusParam(searchParams: SearchParams): Promise<JobStatus | undefined> {
  const status = await value(searchParams, "status");
  return JOB_STATUSES.find((known) => known === status);
}

/** `?application=` when it looks like an id; the list decides whether it's one of this job's. */
export async function applicationParam(searchParams: SearchParams): Promise<string | undefined> {
  const id = await value(searchParams, "application");
  return id !== undefined && /^[a-f0-9]{24}$/i.test(id) ? id : undefined;
}

/** `?created=` after a new job is saved: how it was saved. */
export async function createdParam(
  searchParams: SearchParams,
): Promise<"published" | "draft" | undefined> {
  const created = await value(searchParams, "created");
  return created === "published" || created === "draft" ? created : undefined;
}
