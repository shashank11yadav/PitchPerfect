import type { Metadata } from "next";
import { StudentJobDetail } from "@/components/student/StudentJobDetail";
import { DEMO_JOBS } from "@/lib/demo/jobs";
import { exportOnly } from "@/lib/pages-export";

export const metadata: Metadata = { title: "Job" };

/** The export lists every dynamic route; its layout shows the demo note for all of them. */
export const generateStaticParams = exportOnly(() =>
  DEMO_JOBS.map(({ job }) => ({ slug: job.slug })),
);

export default async function StudentJobPage({ params }: { params: Promise<{ slug: string }> }) {
  return <StudentJobDetail slug={(await params).slug} />;
}
