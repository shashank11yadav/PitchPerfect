import type { Metadata } from "next";
import { JobEditor, JobNotFound } from "@/components/employer/JobEditor";
import { exportOnly } from "@/lib/pages-export";
import { createdParam, jobIdParam, type JobPageProps } from "../../search-params";

export const metadata: Metadata = { title: "Edit job" };

/** The export lists every dynamic route; its layout shows the demo note for all of them. */
export const generateStaticParams = exportOnly(() => [{ id: "demo" }]);

export default async function EditJobPage({ params, searchParams }: JobPageProps) {
  const id = await jobIdParam(params);
  if (!id) return <JobNotFound />;
  return <JobEditor id={id} created={await createdParam(searchParams)} />;
}
