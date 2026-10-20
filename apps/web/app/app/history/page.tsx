import type { Metadata } from "next";
import { PracticeHistory } from "@/components/practice/PracticeHistory";
import { pageParam, skillParam, type SearchParams } from "../search-params";

export const metadata: Metadata = { title: "History" };

export default async function HistoryPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PracticeHistory page={await pageParam(searchParams)} skill={await skillParam(searchParams)} />
  );
}
