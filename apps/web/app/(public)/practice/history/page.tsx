import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DemoFrame } from "@/components/demo/DemoFrame";
import { DemoHistory } from "@/components/demo/DemoRoom";
import { Loading } from "@/components/ui/LoadState";
import { PAGES_EXPORT } from "@/lib/pages-export";

export const metadata: Metadata = {
  title: "Your sessions",
  robots: { index: false, follow: false },
};

/** The sessions run in this tab, newest first. Closing the tab forgets them. */
export default function DemoHistoryPage() {
  if (!PAGES_EXPORT) notFound();
  return (
    <DemoFrame
      title="History"
      lead={<p>The sessions you ran in this tab. They stay here until you close it.</p>}
    >
      <Suspense fallback={<Loading label="Loading your sessions" lines={5} />}>
        <DemoHistory />
      </Suspense>
    </DemoFrame>
  );
}
