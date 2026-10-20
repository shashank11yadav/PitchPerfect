"use client";

import { LIMITS, PublicJobSummaryPageSchema } from "@pitchperfect/shared";
import { Bookmark, Briefcase } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { JobCard } from "@/components/jobs/JobCard";
import { JobFilters } from "@/components/jobs/JobFilters";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadError, Loading } from "@/components/ui/LoadState";
import { Pagination } from "@/components/ui/Pagination";
import { cn } from "@/lib/cn";
import { hasFilters, jobsHref, jobsListPath, type JobQuery } from "@/lib/job-query";
import { useApi } from "@/lib/use-api";

type JobsTab = "all" | "saved";

const BASE = "/app/jobs";
const PAGE_SIZE = LIMITS.pageSizeDefault;
const TEXT_LINK = "pp-link rounded-control font-semibold text-primary";

const savedHref = (page: number) =>
  page > 1 ? `${BASE}?tab=saved&page=${String(page)}` : `${BASE}?tab=saved`;

/** Two views of one page, as links so each has its own URL and the back button works. */
function TabLinks({ tab }: { tab: JobsTab }) {
  const item = (id: JobsTab, href: string, label: string) => (
    <li>
      <Link
        href={href}
        aria-current={tab === id ? "page" : undefined}
        className={cn(
          "-mb-px block border-b-2 px-4 py-2.5 text-small font-semibold",
          tab === id
            ? "border-primary text-primary"
            : "border-transparent text-ink hover:text-primary",
        )}
      >
        {label}
      </Link>
    </li>
  );
  return (
    <nav aria-label="Job lists">
      <ul className="flex gap-1 border-b border-border">
        {item("all", BASE, "All jobs")}
        {item("saved", savedHref(1), "Saved")}
      </ul>
    </nav>
  );
}

interface JobListProps {
  path: string;
  label: string;
  empty: ReactNode;
  hrefFor: (page: number) => string;
  firstPage: string;
}

/** A page of job rows linking into the app, with loading, error, empty and paging. */
function JobList({ path, label, empty, hrefFor, firstPage }: JobListProps) {
  const list = useApi(path, PublicJobSummaryPageSchema);
  if (list.state === "loading") return <Loading label={`Loading ${label}`} lines={5} />;
  if (list.state === "error") return <LoadError what={label} onRetry={list.reload} />;

  const { items, total, page, pageSize } = list.data;
  if (total === 0) return empty;
  if (items.length === 0) {
    return (
      <p className="text-ink">
        This page is past the end of the list.{" "}
        <Link href={firstPage} className={TEXT_LINK}>
          Go to the first page
        </Link>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <Card className="py-0 md:px-8">
        <ul className="divide-y divide-border">
          {items.map((job) => (
            <li key={job.id}>
              <JobCard job={job} href={`${BASE}/${job.slug}`} headingLevel="h2" compact />
            </li>
          ))}
        </ul>
      </Card>
      <Pagination page={page} pageSize={pageSize} total={total} hrefFor={hrefFor} />
    </div>
  );
}

interface StudentJobsProps {
  query: JobQuery;
  tab: JobsTab;
}

/** The job board inside the app, plus the student's saved jobs. */
export function StudentJobs({ query, tab }: StudentJobsProps) {
  if (tab === "saved") {
    return (
      <div className="flex flex-col gap-6">
        <TabLinks tab={tab} />
        <JobList
          path={`/me/saved-jobs?page=${String(query.page)}`}
          label="your saved jobs"
          hrefFor={savedHref}
          firstPage={savedHref(1)}
          empty={
            <EmptyState
              icon={<Bookmark className="size-6" />}
              title="No saved jobs yet"
              description="Press Save job on any listing and it waits here until you’re ready to apply."
              action={
                <Link href={BASE} className={TEXT_LINK}>
                  Browse jobs
                </Link>
              }
            />
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <TabLinks tab={tab} />
      <Card className="bg-primary-soft shadow-none">
        <JobFilters query={query} action={BASE} />
      </Card>
      <JobList
        path={jobsListPath(query, PAGE_SIZE)}
        label="jobs"
        hrefFor={(page) => jobsHref(query, page, BASE)}
        firstPage={jobsHref(query, 1, BASE)}
        empty={
          <EmptyState
            icon={<Briefcase className="size-6" />}
            title={hasFilters(query) ? "No jobs match that search" : "No jobs are listed right now"}
            description={
              hasFilters(query)
                ? "Search looks at job titles and skills. Try a shorter word, like “sales”, or set workplace and job type back to any."
                : "New roles show up here as soon as an employer publishes them. Practice in the meantime, so you’re ready when they do."
            }
            action={
              <Link href={hasFilters(query) ? BASE : "/app/practice"} className={TEXT_LINK}>
                {hasFilters(query) ? "Show every job" : "Go to practice"}
              </Link>
            }
          />
        }
      />
    </div>
  );
}
