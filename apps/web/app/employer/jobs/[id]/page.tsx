import type { Metadata } from "next";
import { JobEditor, JobNotFound } from "@/components/employer/JobEditor";
import { createdParam, jobIdParam, type JobPageProps } from "../../search-params";

export const metadata: Metadata = { title: "Edit job" };

export default async function EditJobPage({ params, searchParams }: JobPageProps) {
  const id = await jobIdParam(params);
  if (!id) return <JobNotFound />;
  return <JobEditor id={id} created={await createdParam(searchParams)} />;
}
