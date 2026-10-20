import type { Metadata } from "next";
import { JobEditor } from "@/components/employer/JobEditor";
import { createdParam, type SearchParams } from "../../search-params";

export const metadata: Metadata = { title: "Edit job" };

export default async function EditJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  return <JobEditor id={(await params).id} created={await createdParam(searchParams)} />;
}
