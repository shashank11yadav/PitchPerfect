import { getSkill, isSkillSlug } from "@pitchperfect/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonContent } from "@/components/learn/LessonContent";
import { LESSONS } from "@/content/lessons";

interface LessonPageProps {
  params: Promise<{ skill: string }>;
}

export async function generateMetadata({ params }: LessonPageProps): Promise<Metadata> {
  const { skill } = await params;
  return { title: isSkillSlug(skill) ? getSkill(skill).title : "Lesson not found" };
}

export default async function LessonPage({ params }: LessonPageProps) {
  const { skill } = await params;
  if (!isSkillSlug(skill)) notFound();
  const Lesson = LESSONS[skill];
  return (
    <LessonContent skill={skill}>
      <Lesson />
    </LessonContent>
  );
}
