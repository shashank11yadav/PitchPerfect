import { isSkillSlug, type SkillSlug } from "@pitchperfect/shared";
import { queryValue as first, type SearchParams } from "@/lib/search-params";

/** Next's `searchParams` for the student pages. */
export type { SearchParams };

/** `?page=` as a whole number from 1, or 1. */
export async function pageParam(searchParams: SearchParams): Promise<number> {
  const page = Number(await first(searchParams, "page"));
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/** `?skill=` when it names a skill. */
export async function skillParam(searchParams: SearchParams): Promise<SkillSlug | undefined> {
  const skill = await first(searchParams, "skill");
  return isSkillSlug(skill) ? skill : undefined;
}

/** `?jobId=` when it looks like an id; the api checks that the job is listed. */
export async function jobIdParam(searchParams: SearchParams): Promise<string | undefined> {
  const jobId = await first(searchParams, "jobId");
  return jobId !== undefined && /^[a-f0-9]{24}$/i.test(jobId) ? jobId : undefined;
}
