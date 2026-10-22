import { getSkill, isSkillSlug, SKILL_SLUGS } from "@pitchperfect/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoFrame } from "@/components/demo/DemoFrame";
import { LessonContent } from "@/components/learn/LessonContent";
import { LESSONS } from "@/content/lessons";
import { exportOnly, PAGES_EXPORT } from "@/lib/pages-export";
import { pageMetadata } from "@/lib/seo";

export const generateStaticParams = exportOnly(() => SKILL_SLUGS.map((skill) => ({ skill })));

interface DemoLessonPageProps {
  params: Promise<{ skill: string }>;
}

export async function generateMetadata({ params }: DemoLessonPageProps): Promise<Metadata> {
  const { skill } = await params;
  if (!isSkillSlug(skill)) return { title: "Lesson not found" };
  const { title, summary } = getSkill(skill);
  return pageMetadata({
    title,
    path: `/learn/${skill}`,
    description: `${summary} A three-minute lesson on ${title.toLowerCase()}, with the rubric line the practice scorecard weighs double for this skill, and a practice call to try it.`,
  });
}

/** One lesson in the static demo; the full app's lives under /app/learn/[skill]. */
export default async function DemoLessonPage({ params }: DemoLessonPageProps) {
  const { skill } = await params;
  if (!PAGES_EXPORT || !isSkillSlug(skill)) notFound();
  const Lesson = LESSONS[skill];
  return (
    <DemoFrame title="Learn">
      <LessonContent skill={skill}>
        <Lesson />
      </LessonContent>
    </DemoFrame>
  );
}
