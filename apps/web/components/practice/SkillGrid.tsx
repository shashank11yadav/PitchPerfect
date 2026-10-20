"use client";

import { SKILLS, type AttemptSummary, type SkillSlug } from "@pitchperfect/shared";
import { ChevronRight, CircleCheck } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { LoadError, Loading } from "@/components/ui/LoadState";
import { cn } from "@/lib/cn";
import { AttemptsPage, LessonsDone, Quota } from "@/lib/student-api";
import { useApi } from "@/lib/use-api";
import { practiceHref } from "@/lib/practice/paths";
import { QuotaMeter } from "./QuotaMeter";
import { scoreBand } from "./ScoreRing";

/** The api's page cap: last scores come from the newest 50 sessions. */
const RECENT = 50;

/** The newest score per skill, from a newest-first list. */
function lastScores(attempts: readonly AttemptSummary[]): Map<SkillSlug, number> {
  const scores = new Map<SkillSlug, number>();
  for (const attempt of attempts) {
    if (attempt.status === "completed" && attempt.overall !== null && !scores.has(attempt.skill)) {
      scores.set(attempt.skill, attempt.overall);
    }
  }
  return scores;
}

interface SkillGridProps {
  /** Lessons the student has marked done. */
  done: readonly SkillSlug[];
  scores: ReadonlyMap<SkillSlug, number>;
  jobId?: string | undefined;
}

function LessonState({ read, className }: { read: boolean; className: string }) {
  return (
    <p className={cn("items-center gap-1.5 text-small text-muted", className)}>
      {read ? (
        <>
          <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-success" />
          Lesson read
        </>
      ) : (
        "Lesson not read"
      )}
    </p>
  );
}

/** The eight skills as rows: whether the lesson is read and the last score. */
function SkillGrid({ done, scores, jobId }: SkillGridProps) {
  return (
    <ul className="divide-y divide-border border-y border-border">
      {SKILLS.map(({ slug, title, summary }) => {
        const score = scores.get(slug);
        const band = score === undefined ? null : scoreBand(score);
        const read = done.includes(slug);
        return (
          <li
            key={slug}
            className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-4 hover:bg-surface-2 sm:grid-cols-[minmax(0,1fr)_8rem_9rem_1.25rem] sm:px-3"
          >
            <div className="min-w-0">
              <h3 className="text-body font-semibold">
                <Link
                  href={practiceHref(slug, jobId)}
                  className="rounded-control text-navy after:absolute after:inset-0"
                >
                  {title}
                </Link>
              </h3>
              <p className="mt-0.5 text-small text-ink">{summary}</p>
              <LessonState read={read} className="mt-1.5 flex sm:hidden" />
            </div>
            <LessonState read={read} className="hidden sm:flex" />
            {band && score !== undefined ? (
              <span className="flex items-center justify-end gap-2">
                <span className="font-display text-h4 font-bold text-navy tabular-nums">
                  {score}
                  <span className="sr-only"> out of 100 last time</span>
                </span>
                <Badge tone={band.tone} className="max-sm:hidden">
                  {band.label}
                </Badge>
              </span>
            ) : (
              <span className="text-right text-small text-muted">Not practiced</span>
            )}
            <ChevronRight aria-hidden="true" className="hidden size-5 text-muted sm:block" />
          </li>
        );
      })}
    </ul>
  );
}

/** `/app/practice`: pick a skill, see sessions left, and get back to past ones. */
export function PracticeOverview({ jobId }: { jobId?: string | undefined }) {
  const lessons = useApi("/me/lessons", LessonsDone);
  const attempts = useApi(`/practice/attempts?pageSize=${String(RECENT)}`, AttemptsPage);
  const quota = useApi("/practice/quota", Quota);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card as="section" aria-labelledby="skills-title" className="flex flex-col gap-4 md:p-8">
        <div className="flex flex-col gap-2">
          <h2 id="skills-title" className="text-h3">
            {jobId ? "Practice for a job" : "Pick a skill"}
          </h2>
          <p className="max-w-prose text-ink">
            {jobId
              ? "Pick a skill and your partner plays someone that job would put you in front of."
              : "Each call is one buyer and one skill. The lesson for a skill takes about three minutes, and it helps to read it first."}
          </p>
          {jobId && (
            <Link
              href="/app/practice"
              className="pp-link self-start rounded-control text-small font-semibold text-primary"
            >
              Practice without the job
            </Link>
          )}
        </div>
        {lessons.state === "loading" || attempts.state === "loading" ? (
          <Loading label="Loading the skills" lines={6} />
        ) : (
          <SkillGrid
            done={lessons.state === "ready" ? lessons.data : []}
            scores={attempts.state === "ready" ? lastScores(attempts.data.items) : new Map()}
            jobId={jobId}
          />
        )}
      </Card>

      <Card as="aside" aria-labelledby="quota-title" className="flex flex-col gap-4">
        <h2 id="quota-title" className="text-h4">
          Sessions left
        </h2>
        {quota.state === "loading" && <Loading label="Loading your sessions" lines={2} />}
        {quota.state === "error" && <LoadError what="your sessions" onRetry={quota.reload} />}
        {quota.state === "ready" && <QuotaMeter quota={quota.data} />}
        <Link
          href="/app/history"
          className="pp-link self-start rounded-control font-semibold text-primary"
        >
          Your past sessions
        </Link>
      </Card>
    </div>
  );
}
