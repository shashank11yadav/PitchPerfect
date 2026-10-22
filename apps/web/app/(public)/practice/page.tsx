import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DemoFrame } from "@/components/demo/DemoFrame";
import { DemoPracticeStart } from "@/components/demo/DemoRoom";
import { Loading } from "@/components/ui/LoadState";
import { PAGES_EXPORT } from "@/lib/pages-export";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Practice",
  path: "/practice",
  description:
    "Run a practice sales call in your browser: pick a skill, talk or type with a scripted buyer, end the call and read a scorecard that quotes what you said.",
});

/** The static demo's practice room; the full app's lives under /app/practice. */
export default function DemoPracticePage() {
  if (!PAGES_EXPORT) notFound();
  return (
    <DemoFrame
      title="Practice"
      lead={
        <p>
          Your partner is scripted and runs in this browser. Nothing you say leaves the page, and
          the scorecard is built here too.
        </p>
      }
    >
      <Suspense fallback={<Loading label="Loading the skills" lines={6} />}>
        <DemoPracticeStart />
      </Suspense>
    </DemoFrame>
  );
}
