import type { Page, PublicJobSummary } from "@pitchperfect/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { JobCard } from "@/components/jobs/JobCard";
import { Pagination } from "@/components/ui/Pagination";
import { hasFilters, jobsHref, type JobQuery } from "@/lib/job-query";

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

/**
 * A heading, a sentence and a way on, set where the list would be: the heading on the left and
 * the way on beside it, so a short note doesn't leave the right half of the page empty.
 */
function ListNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-y-5 py-4 lg:grid-cols-12 lg:items-end lg:gap-x-6">
      <h2 id="results-heading" className="max-w-[18ch] text-section text-navy lg:col-span-6">
        {title}
      </h2>
      <div className="flex max-w-[46ch] flex-col items-start gap-5 text-lede text-ink lg:col-span-5 lg:col-start-8">
        {children}
      </div>
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

interface JobsListProps {
  query: JobQuery;
  /** The api's page, or null when it couldn't be reached. */
  result: Page<PublicJobSummary> | null;
}

/**
 * The board's results for one query: the count, the cards and the pagination, or the note that
 * stands in for them. Rendered on the server from the api, and in the browser by the static demo.
 */
export function JobsList({ query, result }: JobsListProps) {
  if (!result) return <Unavailable query={query} />;
  if (result.items.length === 0) return <NoResults query={query} total={result.total} />;

  const pages = Math.ceil(result.total / result.pageSize);
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 pb-4 md:pb-6">
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
