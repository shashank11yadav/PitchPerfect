import {
  PublicJobSummaryPageSchema,
  SKILL_SLUGS,
  type PublicJobSummary,
} from "@pitchperfect/shared";
import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { PAGES_EXPORT, staticMetadataRoute } from "@/lib/pages-export";

import { absoluteUrl, PUBLIC_PAGES } from "@/lib/seo";
import { serverApi } from "@/lib/server-api";

const PAGE_SIZE = 50;
/** A backstop against a misbehaving api: 100 pages is 5,000 jobs. */
const MAX_PAGES = 100;

/** Every active job, page by page. Throws if any page fails. */
async function activeJobs(): Promise<PublicJobSummary[]> {
  const jobs: PublicJobSummary[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await serverApi(
      `/api/jobs?pageSize=${String(PAGE_SIZE)}&page=${String(page)}`,
      PublicJobSummaryPageSchema,
    );
    jobs.push(...result.items);
    if (result.items.length === 0 || page * PAGE_SIZE >= result.total) break;
  }
  return jobs;
}

/** Pre-rendered in the static export only; see `staticMetadataRoute`. */
export const generateStaticParams = staticMetadataRoute;

/**
 * Static public pages, plus active jobs of verified companies that aren't samples
 * (docs/design-system.md, SEO). The static demo lists no jobs: its board is samples, and its job
 * pages are `noindex`.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Built per request, so new jobs appear without a rebuild. The static demo bakes its board.
  if (!PAGES_EXPORT) await connection();
  const paths = Object.values(PUBLIC_PAGES).map(({ path }) => path);
  // The static demo's practice room and lessons are public pages there, and nowhere else.
  const demoPaths = PAGES_EXPORT
    ? [
        "/practice",
        "/learn",
        ...SKILL_SLUGS.flatMap((skill) => [`/practice/${skill}`, `/learn/${skill}`]),
      ]
    : [];
  const pages = [...paths, ...demoPaths].map((path) => ({ url: absoluteUrl(path) }));

  // If the api can't be reached, the static pages are still worth serving.
  const jobs = PAGES_EXPORT ? [] : await activeJobs().catch(() => []);
  const jobEntries = jobs
    .filter((job) => !job.company.sample && job.company.verification === "verified")
    // No lastModified: publishedAt says when a job went live, not when its page last changed.
    .map((job) => ({ url: absoluteUrl(`/jobs/${job.slug}`) }));

  return [...pages, ...jobEntries];
}
