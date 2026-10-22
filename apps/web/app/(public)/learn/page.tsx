import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoFrame } from "@/components/demo/DemoFrame";
import { LessonList } from "@/components/learn/LessonList";
import { PAGES_EXPORT } from "@/lib/pages-export";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Learn",
  path: "/learn",
  description:
    "Eight short lessons on the sales skills the practice calls test: introducing yourself, pitching, objection handling, discovery, referrals, next steps, closing and rapport.",
});

/** The static demo's lesson list; the full app's lives under /app/learn. */
export default function DemoLearnPage() {
  if (!PAGES_EXPORT) notFound();
  return (
    <DemoFrame title="Learn">
      <LessonList />
    </DemoFrame>
  );
}
