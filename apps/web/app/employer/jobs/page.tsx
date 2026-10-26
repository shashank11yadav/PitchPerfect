import type { Metadata } from "next";
import { JobTable } from "@/components/employer/JobTable";
import { jobStatusParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Jobs" };

export default async function EmployerJobsPage({ searchParams }: { searchParams: SearchParams }) {
  return <JobTable initialStatus={await jobStatusParam(searchParams)} />;
}
