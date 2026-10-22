import { getSkill, isSkillSlug, SKILL_SLUGS } from "@pitchperfect/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DemoFrame } from "@/components/demo/DemoFrame";
import { DemoSkillRoom } from "@/components/demo/DemoRoom";
import { Loading } from "@/components/ui/LoadState";
import { exportOnly, PAGES_EXPORT } from "@/lib/pages-export";
import { pageMetadata } from "@/lib/seo";

export const generateStaticParams = exportOnly(() => SKILL_SLUGS.map((skill) => ({ skill })));

interface DemoSkillPageProps {
  params: Promise<{ skill: string }>;
}

export async function generateMetadata({ params }: DemoSkillPageProps): Promise<Metadata> {
  const { skill } = await params;
  if (!isSkillSlug(skill)) return { title: "Practice" };
  const { title, summary } = getSkill(skill);
  return pageMetadata({
    title: `Practice ${title.toLowerCase()}`,
    path: `/practice/${skill}`,
    description: `${summary} Run the call with a scripted buyer in your browser, by voice or text, and read a scorecard that quotes your own words at the end.`,
  });
}

/** The static demo's room for one skill; the full app's lives under /app/practice/[skill]. */
export default async function DemoSkillPage({ params }: DemoSkillPageProps) {
  const { skill } = await params;
  if (!PAGES_EXPORT || !isSkillSlug(skill)) notFound();
  return (
    <DemoFrame title="Practice">
      <Suspense fallback={<Loading label="Loading the practice room" lines={6} />}>
        <DemoSkillRoom skill={skill} />
      </Suspense>
    </DemoFrame>
  );
}
