"use client";

import { useSearchParams } from "next/navigation";
import { listDemoJobs } from "@/lib/demo/jobs";
import { parseJobQuery } from "@/lib/job-query";
import { JobFilters } from "./JobFilters";
import { JobsList } from "./JobsList";

/**
 * The static demo's job board: the same filters, read from the page URL in the browser and run
 * over the baked listings. The search form stays a plain GET, so the URL is still the state.
 */

/** The board's filters as the URL has them. */
function useJobQuery() {
  return parseJobQuery(Object.fromEntries(useSearchParams()));
}

/** The search form with the URL's filters filled in. */
export function DemoJobFilters() {
  return <JobFilters query={useJobQuery()} />;
}

/** The results for the URL's filters. */
export function JobsBrowser({ pageSize }: { pageSize: number }) {
  const query = useJobQuery();
  return <JobsList query={query} result={listDemoJobs(query, pageSize)} />;
}
