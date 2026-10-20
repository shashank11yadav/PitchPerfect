import type { Metadata } from "next";
import { StudentJobDetail } from "@/components/student/StudentJobDetail";

export const metadata: Metadata = { title: "Job" };

export default async function StudentJobPage({ params }: { params: Promise<{ slug: string }> }) {
  return <StudentJobDetail slug={(await params).slug} />;
}
