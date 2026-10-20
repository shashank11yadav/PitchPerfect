import type { Metadata } from "next";
import { DashboardStats } from "@/components/employer/DashboardStats";

export const metadata: Metadata = { title: "Dashboard" };

export default function EmployerDashboardPage() {
  return <DashboardStats />;
}
