import type { Metadata } from "next";
import { AttemptScreen } from "@/components/practice/AttemptScreen";

export const metadata: Metadata = { title: "Practice session" };

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  return <AttemptScreen id={(await params).id} />;
}
