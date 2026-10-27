import { LIMITS, PublicJobSummaryPageSchema } from "@pitchperfect/shared";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { JobFilters } from "@/components/jobs/JobFilters";
import { JobsList } from "@/components/jobs/JobsList";
import { CtaBand } from "@/components/marketing/CtaBand";
import { PageHero } from "@/components/marketing/Hero";
import { Section, WRAP } from "@/components/marketing/Section";
import { Loading } from "@/components/ui/LoadState";
import { cn } from "@/lib/cn";
import { jobsApiPath, parseJobQuery, type JobQuery } from "@/lib/job-query";
import { PAGES_EXPORT } from "@/lib/pages-export";
import { pageMetadata, PUBLIC_PAGES } from "@/lib/seo";
import { serverApi } from "@/lib/server-api";

export const metadata = pageMetadata(PUBLIC_PAGES.jobs);

/*
 * The static demo's browser-side board, loaded only where it renders: a server build never shows
 * it, so its code (the query parser and its schemas, the baked listings) stays out of the page.
 */
const DemoJobFilters = dynamic(() =>
  import("@/components/jobs/JobsBrowser").then((module) => module.DemoJobFilters),
);
const JobsBrowser = dynamic(() =>
  import("@/components/jobs/JobsBrowser").then((module) => module.JobsBrowser),
);

const PAGE_SIZE = LIMITS.pageSizeDefault;

/** The results from the api. Any failure, network or response, gets the same calm message. */
const serverJobs = (query: JobQuery) =>
  serverApi(jobsApiPath(query, PAGE_SIZE), PublicJobSummaryPageSchema).catch(() => null);

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The static export has no server to read the URL: the browser reads it and runs the filters.
  const query = PAGES_EXPORT ? undefined : parseJobQuery(await searchParams);
  const result = query ? await serverJobs(query) : null;

  return (
    <>
      <PageHero
        compact
        title="Sales jobs for people starting out"
        lead={
          <>
            {/* On a phone the listings come first; each card shows its pay and badge anyway. */}
            <p className="max-md:hidden">
              Entry-level roles in sales development, customer success and business development.
              Each listing names its pay, and shows whether the employer has verified its domain.
            </p>
            {PAGES_EXPORT && (
              <p className="max-md:text-small md:mt-4">
                The listings in this demo are samples: the companies are fictional and none of these
                jobs is open.
              </p>
            )}
          </>
        }
      />
      <div className="bg-primary-soft">
        <div className={cn(WRAP, "py-5 md:py-12")}>
          {query ? (
            <JobFilters query={query} />
          ) : (
            <Suspense fallback={<JobFilters query={{ page: 1 }} />}>
              <DemoJobFilters />
            </Suspense>
          )}
        </div>
      </div>
      <Section labelledBy="results-heading" className="pt-8 pb-14 md:py-20">
        {query ? (
          <JobsList query={query} result={result} />
        ) : (
          <Suspense fallback={<Loading label="Loading the jobs" lines={6} />}>
            <JobsBrowser pageSize={PAGE_SIZE} />
          </Suspense>
        )}
      </Section>
      <CtaBand
        title="Hiring someone new to sales?"
        body="Post it here. Applicants can attach a scorecard from a practice call, so you can read how they handle a buyer before you meet."
        primary={{ href: "/signup/employer", label: "Post a job" }}
        secondary={{ href: "/employers", label: "How it works for employers" }}
      />
    </>
  );
}
