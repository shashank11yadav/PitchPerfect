import type { Metadata } from "next";
import { DashboardSummary } from "@/components/student/DashboardSummary";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return <DashboardSummary />;
}
