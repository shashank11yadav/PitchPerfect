import { LIMITS, PublicJobSummaryPageSchema } from "@pitchperfect/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { JobCard } from "@/components/jobs/JobCard";
import { JobFilters } from "@/components/jobs/JobFilters";
import { CtaBand } from "@/components/marketing/CtaBand";
import { PageHero } from "@/components/marketing/Hero";
import { Section, WRAP } from "@/components/marketing/Section";
import { Pagination } from "@/components/ui/Pagination";
import { cn } from "@/lib/cn";
import { hasFilters, jobsApiPath, jobsHref, parseJobQuery, type JobQuery } from "@/lib/job-query";
import { pageMetadata, PUBLIC_PAGES } from "@/lib/seo";
import { serverApi } from "@/lib/server-api";

export const metadata = pageMetadata(PUBLIC_PAGES.jobs);

const PAGE_SIZE = LIMITS.pageSizeDefault;

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

/** A heading, a sentence and a way on, set where the list would be. */
function ListNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="max-w-[46ch] py-4">
      <h2 id="results-heading" className="text-section text-navy">
        {title}
      </h2>
      <div className="mt-5 flex flex-col items-start gap-5 text-lede text-ink">{children}</div>
    </div>
  );
}

const textLink = "pp-link rounded-control font-semibold text-primary";

function Unavailable({ query }: { query: JobQuery }) {
  return (
    <ListNote title="We couldn’t load the jobs">
      <p>
        The job board isn&apos;t answering right now. Your search is still in the form above; try
        again in a minute.
      </p>
      <Link href={jobsHref(query)} className={textLink}>
        Try again
      </Link>
    </ListNote>
  );
}

function NoResults({ query, total }: { query: JobQuery; total: number }) {
  if (total > 0) {
    return (
      <ListNote title="That page is past the end of the list">
        <p>The list has fewer pages now, probably because a job was filled or taken down.</p>
        <Link href={jobsHref(query, 1)} className={textLink}>
          Go to the first page
        </Link>
      </ListNote>
    );
  }
  if (hasFilters(query)) {
    return (
      <ListNote title="No jobs match that search">
        <p>
          Search looks at job titles and skills. Try a shorter word, like &ldquo;sales&rdquo; or
          &ldquo;discovery&rdquo;, or set workplace and job type back to any.
        </p>
        <Link href="/jobs" className={textLink}>
          Show every job
        </Link>
      </ListNote>
    );
  }
  return (
    <ListNote title="No jobs are listed right now">
      <p>
        New roles show up here as soon as an employer publishes them. Until then, you can practice
        the first calls these jobs start with.
      </p>
      <Link href="/students" className={textLink}>
        See how practice works
      </Link>
    </ListNote>
  );
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseJobQuery(await searchParams);
  // Any failure, network or response, gets the same calm message instead of the error page.
  const result = await serverApi(jobsApiPath(query, PAGE_SIZE), PublicJobSummaryPageSchema).catch(
    () => null,
  );

  let list: ReactNode;
  if (!result) {
    list = <Unavailable query={query} />;
  } else if (result.items.length === 0) {
    list = <NoResults query={query} total={result.total} />;
  } else {
    const pages = Math.ceil(result.total / result.pageSize);
    list = (
      <>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 pb-6">
          <h2 id="results-heading" className="text-section text-navy">
            {hasFilters(query)
              ? `${plural(result.total, "job matches", "jobs match")} your search`
              : plural(result.total, "open role", "open roles")}
          </h2>
          {pages > 1 && (
            <p className="text-ink">
              Page {result.page} of {pages}
            </p>
          )}
        </div>
        <ul className="divide-y divide-border border-y border-border">
          {result.items.map((job) => (
            <li key={job.id}>
              <JobCard job={job} />
            </li>
          ))}
        </ul>
        <Pagination
          className="mt-10"
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          hrefFor={(page) => jobsHref(query, page)}
        />
      </>
    );
  }

  return (
    <>
      <PageHero
        title="Sales jobs for people starting out"
        lead={
          <p>
            Entry-level roles in sales development, customer success and business development. Each
            listing names its pay, and shows whether the employer has verified its domain.
          </p>
        }
      />
      <div className="bg-primary-soft">
        <div className={cn(WRAP, "py-10 md:py-12")}>
          <JobFilters query={query} />
        </div>
      </div>
      <Section labelledBy="results-heading" className="py-14 md:py-20">
        {list}
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
