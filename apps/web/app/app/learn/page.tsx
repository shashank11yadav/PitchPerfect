import type { Metadata } from "next";
import { LessonList } from "@/components/learn/LessonList";

export const metadata: Metadata = { title: "Learn" };

export default function LearnPage() {
  return <LessonList />;
}
