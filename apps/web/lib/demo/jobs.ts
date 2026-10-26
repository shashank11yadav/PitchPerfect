import type { Page, PublicCompany, PublicJob, PublicJobSummary } from "@pitchperfect/shared";
import {
  SEED_COMPANIES,
  SEED_JOBS,
  seedCompanySlug,
  seedJobSlug,
} from "@pitchperfect/shared/seed-data";
import type { JobQuery } from "@/lib/job-query";

/**
 * The job board of the static demo: the api's seed data as the api would answer it, built once at
 * module load, with the same slugs the seed gives them. Draft and archived jobs are left out, as
 * the public board leaves them out. Dates and ids are fixed, so the export is the same from one
 * build to the next. Every listing here is a sample: the board says so once, and the job pages
 * stay out of search (app/(public)/jobs).
 */

export interface DemoJob {
  job: PublicJob;
  company: PublicCompany;
}

/** The newest listing's date; each earlier one in the seed is a day older. */
const NEWEST_PUBLISHED_AT = Date.UTC(2026, 9, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

/** A 24-character hex id, the shape the app expects of an api id. */
const hexId = (n: number) => n.toString(16).padStart(24, "0");

const COMPANIES: readonly PublicCompany[] = SEED_COMPANIES.map((company, index) => ({
  id: hexId(1000 + index),
  name: company.name,
  slug: seedCompanySlug(company),
  website: `https://${company.host}`,
  linkedinUrl: null,
  pitch: company.pitch,
  logoUrl: null,
  verification: company.verification,
}));

export const DEMO_JOBS: readonly DemoJob[] = SEED_JOBS.flatMap((seed, index) => {
  const company = COMPANIES[seed.company];
  const source = SEED_COMPANIES[seed.company];
  if (seed.status !== "active" || !company || !source) return [];
  const job: PublicJob = {
    id: hexId(index + 1),
    slug: seedJobSlug(seed, source),
    title: seed.title,
    location: seed.location,
    workplace: seed.workplace,
    employmentType: seed.employmentType,
    pay: seed.pay,
    skills: [...seed.skills],
    publishedAt: new Date(NEWEST_PUBLISHED_AT - index * DAY_MS).toISOString(),
    descriptionHtml: seed.descriptionHtml,
    company: {
      name: company.name,
      slug: company.slug,
      logoUrl: company.logoUrl,
      verification: company.verification,
    },
  };
  return [{ job, company }];
});

/** The listed job with this slug, or undefined: the api's 404. */
export function findDemoJob(slug: string): DemoJob | undefined {
  return DEMO_JOBS.find(({ job }) => job.slug === slug);
}

/** The id's job, for a practice call set up around it. */
export function findDemoJobById(id: string): DemoJob | undefined {
  return DEMO_JOBS.find(({ job }) => job.id === id);
}

/** The listing without its description, as the api's list answers it. */
const summaryOf = (job: PublicJob): PublicJobSummary => ({
  id: job.id,
  slug: job.slug,
  title: job.title,
  location: job.location,
  workplace: job.workplace,
  employmentType: job.employmentType,
  pay: job.pay,
  skills: job.skills,
  publishedAt: job.publishedAt,
  company: job.company,
});

const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * How well a job matches the search words: one point per word that starts a word of its title or
 * skills ("discover" finds "Discovery questions"). The api's text index works the same way in
 * spirit: any word may match, and better matches come first.
 */
function searchScore(job: PublicJob, terms: readonly string[]): number {
  const haystack = words([job.title, ...job.skills].join(" "));
  return terms.filter((term) => haystack.some((word) => word.startsWith(term))).length;
}

/** `GET /api/jobs` over the baked board: filters, search ranking, newest first, one page. */
export function listDemoJobs(query: JobQuery, pageSize: number): Page<PublicJobSummary> {
  const terms = words(query.q ?? "");
  const matches = DEMO_JOBS.map(({ job }) => job)
    .filter(
      (job) =>
        (!query.workplace || job.workplace === query.workplace) &&
        (!query.employmentType || job.employmentType === query.employmentType),
    )
    .map((job) => ({ job, score: terms.length ? searchScore(job, terms) : 0 }))
    .filter(({ score }) => terms.length === 0 || score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || (b.job.publishedAt ?? "").localeCompare(a.job.publishedAt ?? ""),
    )
    .map(({ job }) => summaryOf(job));
  const start = (query.page - 1) * pageSize;
  return {
    items: matches.slice(start, start + pageSize),
    page: query.page,
    pageSize,
    total: matches.length,
  };
}
