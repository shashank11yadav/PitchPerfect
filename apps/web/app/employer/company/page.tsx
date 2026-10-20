import type { Metadata } from "next";
import { CompanyForm } from "@/components/employer/CompanyForm";

export const metadata: Metadata = { title: "Company" };

export default function CompanyPage() {
  return <CompanyForm />;
}
