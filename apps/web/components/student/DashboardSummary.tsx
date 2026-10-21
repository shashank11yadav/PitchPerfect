"use client";

import {
  APPLICATION_STATUSES,
  SKILLS,
  getSkill,
  type ApplicationStatus,
  type AttemptSummary,
} from "@pitchperfect/shared";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { QuotaMeter } from "@/components/practice/QuotaMeter";
import { scoreBand } from "@/components/practice/ScoreRing";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { LoadError, Loading } from "@/components/ui/LoadState";
import { cn } from "@/lib/cn";
import { formatLocalDate } from "@/lib/local-time";
import { ApplicationsPage, AttemptsPage, LessonsDone, Quota } from "@/lib/student-api";
import { useApi, type Loaded } from "@/lib/use-api";
import { STATUS_LABELS } from "./StatusPill";

const TEXT_LINK =
  "pp-link inline-flex items-center gap-1.5 self-start rounded-control font-semibold text-primary";
const RECENT = 3;
/** Enough for any student's counts; the api caps a page at 50. */
const COUNT_PAGE = 50;

interface PanelProps<T> {
  title: string;
  /** Names the data for the loading and error messages. */
  what: string;
  loaded: Loaded<T> & { reload: () => void };
  className?: string;
  children: (data: T) => ReactNode;
}

/** One dashboard card: a heading, then its data, a placeholder, or a retry. */
function Panel<T>({ title, what, loaded, className, children }: PanelProps<T>) {
  const id = `dash-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <Card as="section" aria-labelledby={id} className={cn("flex flex-col gap-4", className)}>
      <h2 id={id} className="text-h4">
        {title}
      </h2>
      {loaded.state === "loading" && <Loading label={`Loading ${what}`} />}
      {loaded.state === "error" && <LoadError what={what} onRetry={loaded.reload} />}
      {loaded.state === "ready" && children(loaded.data)}
    </Card>
  );
}

function NextLesson({ done }: { done: readonly string[] }) {
  const next = SKILLS.find(({ slug }) => !done.includes(slug));
  if (!next) {
    return (
      <>
        <p className="text-ink">
          You’ve read every lesson. Go back to any of them before a practice call on that skill.
        </p>
        <Link href="/app/learn" className={TEXT_LINK}>
          Browse the lessons
        </Link>
      </>
    );
  }
  return (
    <>
      <p className="text-small text-muted">
        {done.length === 0
          ? "Start with the first lesson. Each takes about three minutes."
          : `${String(done.length)} of ${String(SKILLS.length)} lessons done.`}
      </p>
      <div>
        <Link
          href={`/app/learn/${next.slug}`}
          className="pp-link rounded-control font-display text-h3 font-semibold text-navy"
        >
          {next.title}
        </Link>
        <p className="mt-1 text-ink">{next.summary}</p>
      </div>
    </>
  );
}

function Scorecards({ attempts }: { attempts: readonly AttemptSummary[] }) {
  const scored = attempts
    .filter((attempt) => attempt.status === "completed" && attempt.overall !== null)
    .slice(0, RECENT);
  if (scored.length === 0) {
    return (
      <>
        <p className="text-ink">
          No scorecards yet. Finish a practice call and its scorecard shows up here, with the words
          it was based on.
        </p>
        <Link href="/app/practice" className={TEXT_LINK}>
          Start a practice call
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </>
    );
  }
  return (
    <ul className="-mx-2 flex flex-col">
      {scored.map((attempt) => {
        const overall = attempt.overall ?? 0;
        const band = scoreBand(overall);
        const when = attempt.endedAt ?? attempt.startedAt;
        return (
          <li key={attempt.id}>
            <Link
              href={`/app/practice/attempt/${attempt.id}`}
              className="flex items-center gap-4 rounded-control px-2 py-2.5 hover:bg-surface-2"
            >
              <span aria-hidden="true" className="w-10 font-display text-h3 font-bold text-navy">
                {overall}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">
                  {getSkill(attempt.skill).title}
                </span>
                <span className="block text-small text-muted">{formatLocalDate(when)}</span>
              </span>
              <Badge tone={band.tone}>{band.label}</Badge>
              <span className="sr-only">, scored {overall} out of 100</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ApplicationCounts({ statuses, total }: { statuses: ApplicationStatus[]; total: number }) {
  if (total === 0) {
    return (
      <>
        <p className="text-ink">
          You haven’t applied to anything yet. Every job lists its pay, and you can attach a
          practice scorecard when you apply.
        </p>
        <Link href="/app/jobs" className={TEXT_LINK}>
          Browse jobs
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </>
    );
  }
  const counts = APPLICATION_STATUSES.map(
    (status) => [status, statuses.filter((value) => value === status).length] as const,
  ).filter(([, count]) => count > 0);
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        {counts.map(([status, count]) => (
          <div key={status} className="flex flex-col-reverse">
            <dt className="text-small text-muted">{STATUS_LABELS[status]}</dt>
            <dd className="font-display text-h3 font-bold text-navy">{count}</dd>
          </div>
        ))}
      </dl>
      <Link href="/app/applications" className={TEXT_LINK}>
        See all applications
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </>
  );
}

/**
 * The student's home: the next lesson, practice sessions left, recent scorecards and where their
 * applications stand. Each card loads on its own, so one slow or failed request doesn't hide
 * the others.
 */
export function DashboardSummary() {
  const lessons = useApi("/me/lessons", LessonsDone);
  const quota = useApi("/practice/quota", Quota);
  const attempts = useApi("/practice/attempts?page=1", AttemptsPage);
  const applications = useApi(`/me/applications?pageSize=${String(COUNT_PAGE)}`, ApplicationsPage);

  return (
    // Two columns of different widths, each card as tall as its content: what to do next on the
    // left, the counts on the right.
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex flex-col gap-6">
        <Panel title="Next lesson" what="your lessons" loaded={lessons}>
          {(done) => <NextLesson done={done} />}
        </Panel>
        <Panel title="Recent scorecards" what="your scorecards" loaded={attempts}>
          {(page) => <Scorecards attempts={page.items} />}
        </Panel>
      </div>
      <div className="flex flex-col gap-6">
        <Panel title="Practice sessions" what="your practice sessions" loaded={quota}>
          {(data) => (
            <>
              <QuotaMeter quota={data} />
              {data.available && (
                <Link href="/app/practice" className={TEXT_LINK}>
                  Start a practice call
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              )}
            </>
          )}
        </Panel>
        <Panel title="Applications" what="your applications" loaded={applications}>
          {(page) => (
            <ApplicationCounts
              statuses={page.items.map((item) => item.status)}
              total={page.total}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
