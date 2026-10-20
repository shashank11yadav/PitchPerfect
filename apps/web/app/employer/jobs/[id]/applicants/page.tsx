import type { Metadata } from "next";
import { JobApplicants } from "@/components/employer/JobApplicants";
import { JobNotFound } from "@/components/employer/JobEditor";
import { applicationParam, jobIdParam, type JobPageProps } from "../../../search-params";

export const metadata: Metadata = { title: "Applicants" };

export default async function ApplicantsPage({ params, searchParams }: JobPageProps) {
  const id = await jobIdParam(params);
  if (!id) return <JobNotFound />;
  return <JobApplicants id={id} initialId={await applicationParam(searchParams)} />;
}
