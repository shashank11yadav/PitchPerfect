import { PublicJobSummaryPageSchema, type PublicJobSummary } from "@pitchperfect/shared";
import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { PUBLIC_PAGES } from "@/lib/seo";
import { serverApi } from "@/lib/server-api";
import { SITE_URL } from "@/lib/site";

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

/** Static public pages, plus active jobs of verified companies (docs/design-system.md, SEO). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Built per request, so new jobs appear without a rebuild.
  await connection();
  const pages = Object.values(PUBLIC_PAGES).map(({ path }) => ({
    url: new URL(path, `${SITE_URL}/`).toString(),
  }));

  // If the api can't be reached, the static pages are still worth serving.
  const jobs = await activeJobs().catch(() => []);
  const jobEntries = jobs
    .filter((job) => job.company.verification === "verified")
    .map((job) => ({
      url: `${SITE_URL}/jobs/${job.slug}`,
      ...(job.publishedAt && { lastModified: job.publishedAt }),
    }));

  return [...pages, ...jobEntries];
}
