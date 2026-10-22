import type { Metadata } from "next";
import { JobApplicants } from "@/components/employer/JobApplicants";
import { JobNotFound } from "@/components/employer/JobEditor";
import { exportOnly } from "@/lib/pages-export";
import { applicationParam, jobIdParam, type JobPageProps } from "../../../search-params";

export const metadata: Metadata = { title: "Applicants" };

/** The export lists every dynamic route; its layout shows the demo note for all of them. */
export const generateStaticParams = exportOnly(() => [{ id: "demo" }]);

export default async function ApplicantsPage({ params, searchParams }: JobPageProps) {
  const id = await jobIdParam(params);
  if (!id) return <JobNotFound />;
  return <JobApplicants id={id} initialId={await applicationParam(searchParams)} />;
}
