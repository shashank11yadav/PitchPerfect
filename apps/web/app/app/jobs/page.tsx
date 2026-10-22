import type { Metadata } from "next";
import { StudentJobs } from "@/components/student/StudentJobs";
import { parseJobQuery } from "@/lib/job-query";
import { PAGES_EXPORT } from "@/lib/pages-export";
import type { SearchParams } from "../search-params";

export const metadata: Metadata = { title: "Jobs" };

export default async function StudentJobsPage({ searchParams }: { searchParams: SearchParams }) {
  // The static export has no server to read a query string; its layout shows a note instead.
  const params = PAGES_EXPORT ? {} : await searchParams;
  return (
    <StudentJobs query={parseJobQuery(params)} tab={params.tab === "saved" ? "saved" : "all"} />
  );
}
