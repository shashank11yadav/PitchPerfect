import type { Metadata } from "next";
import { NewJob } from "@/components/employer/NewJob";

export const metadata: Metadata = { title: "New job" };

export default function NewJobPage() {
  return <NewJob />;
}
