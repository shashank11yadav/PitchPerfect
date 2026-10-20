import type { Metadata } from "next";
import { StudentJobs } from "@/components/student/StudentJobs";
import { parseJobQuery } from "@/lib/job-query";
import type { SearchParams } from "../search-params";

export const metadata: Metadata = { title: "Jobs" };

export default async function StudentJobsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return (
    <StudentJobs query={parseJobQuery(params)} tab={params.tab === "saved" ? "saved" : "all"} />
  );
}
