import { getSkill, isSkillSlug, SKILL_SLUGS } from "@pitchperfect/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PracticeRoom } from "@/components/practice/PracticeRoom";
import { exportOnly } from "@/lib/pages-export";
import { jobIdParam, type SearchParams } from "../../search-params";

/** The export lists every dynamic route; its layout shows the demo note for all of them. */
export const generateStaticParams = exportOnly(() => SKILL_SLUGS.map((skill) => ({ skill })));

interface SkillPracticePageProps {
  params: Promise<{ skill: string }>;
  searchParams: SearchParams;
}

export async function generateMetadata({ params }: SkillPracticePageProps): Promise<Metadata> {
  const { skill } = await params;
  return {
    title: isSkillSlug(skill) ? `Practice ${getSkill(skill).title.toLowerCase()}` : "Practice",
  };
}

export default async function SkillPracticePage({ params, searchParams }: SkillPracticePageProps) {
  const { skill } = await params;
  if (!isSkillSlug(skill)) notFound();
  return <PracticeRoom skill={skill} jobId={await jobIdParam(searchParams)} />;
}
