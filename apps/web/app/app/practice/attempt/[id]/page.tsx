import type { Metadata } from "next";
import { AttemptScreen } from "@/components/practice/AttemptScreen";
import { exportOnly } from "@/lib/pages-export";

export const metadata: Metadata = { title: "Practice session" };

/** The export lists every dynamic route; its layout shows the demo note for all of them. */
export const generateStaticParams = exportOnly(() => [{ id: "demo" }]);

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  return <AttemptScreen id={(await params).id} />;
}
