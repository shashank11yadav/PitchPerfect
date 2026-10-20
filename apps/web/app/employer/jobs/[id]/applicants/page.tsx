import type { Metadata } from "next";
import { JobApplicants } from "@/components/employer/JobApplicants";
import { applicationParam, type SearchParams } from "../../../search-params";

export const metadata: Metadata = { title: "Applicants" };

export default async function ApplicantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  return <JobApplicants id={(await params).id} initialId={await applicationParam(searchParams)} />;
}
