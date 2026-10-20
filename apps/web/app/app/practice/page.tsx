import type { Metadata } from "next";
import { PracticeOverview } from "@/components/practice/SkillGrid";
import { jobIdParam, type SearchParams } from "../search-params";

export const metadata: Metadata = { title: "Practice" };

export default async function PracticePage({ searchParams }: { searchParams: SearchParams }) {
  return <PracticeOverview jobId={await jobIdParam(searchParams)} />;
}
