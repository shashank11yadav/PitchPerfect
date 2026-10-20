import type { Metadata } from "next";
import { ApplicationList } from "@/components/student/ApplicationList";
import { pageParam, type SearchParams } from "../search-params";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage({ searchParams }: { searchParams: SearchParams }) {
  return <ApplicationList page={await pageParam(searchParams)} />;
}
