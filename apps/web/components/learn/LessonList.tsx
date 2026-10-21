"use client";

import { SKILLS } from "@pitchperfect/shared";
import { Check } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { LessonsDone } from "@/lib/student-api";
import { useApi } from "@/lib/use-api";

/** The eight lessons in course order, with which ones the student has finished. */
export function LessonList() {
  const lessons = useApi("/me/lessons", LessonsDone);
  const done = lessons.state === "ready" ? lessons.data : [];
  const next = SKILLS.find(({ slug }) => !done.includes(slug));

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose text-ink">
        Each lesson takes about three minutes to read and ends with a practice call for the same
        skill.{" "}
        {lessons.state === "ready" && (
          <span className="font-semibold">
            {done.length === SKILLS.length
              ? "You’ve read every lesson."
              : `${String(done.length)} of ${String(SKILLS.length)} done.`}
          </span>
        )}
      </p>
      <Card className="p-0">
        <ol className="divide-y divide-border">
          {SKILLS.map(({ slug, title, summary }) => {
            const finished = done.includes(slug);
            return (
              <li key={slug}>
                <Link
                  href={`/app/learn/${slug}`}
                  className="group flex items-start gap-4 rounded-card px-5 py-5 hover:bg-surface-2 md:px-6"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-pill border",
                      finished ? "border-success bg-success text-white" : "border-muted",
                    )}
                  >
                    {finished && <Check className="size-4" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-display text-h4 font-semibold text-navy group-hover:underline">
                        {title}
                      </span>
                      {finished && <span className="text-small text-ink">Done</span>}
                      {slug === next?.slug && lessons.state === "ready" && (
                        <span className="rounded-pill bg-primary-soft px-2.5 py-0.5 text-caption font-semibold text-primary">
                          Up next
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-ink">{summary}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
