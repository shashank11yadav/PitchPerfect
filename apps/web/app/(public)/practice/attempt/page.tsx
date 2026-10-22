import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DemoAttempt } from "@/components/demo/DemoRoom";
import { DemoFrame } from "@/components/demo/DemoFrame";
import { Loading } from "@/components/ui/LoadState";
import { PAGES_EXPORT } from "@/lib/pages-export";

export const metadata: Metadata = {
  title: "Practice session",
  robots: { index: false, follow: false },
};

/** One of this tab's sessions, named in the query string. */
export default function DemoAttemptPage() {
  if (!PAGES_EXPORT) notFound();
  return (
    <DemoFrame title="Practice">
      <Suspense fallback={<Loading label="Loading the session" lines={6} />}>
        <DemoAttempt />
      </Suspense>
    </DemoFrame>
  );
}
