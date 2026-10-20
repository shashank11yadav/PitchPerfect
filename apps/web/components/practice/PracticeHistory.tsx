"use client";

import {
  SKILLS,
  getSkill,
  type AttemptStatus,
  type AttemptSummary,
  type SkillSlug,
} from "@pitchperfect/shared";
import { History } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadError, Loading } from "@/components/ui/LoadState";
import { Pagination } from "@/components/ui/Pagination";
import { formatLocalDate } from "@/lib/local-time";
import { attemptPath } from "@/lib/practice/paths";
import { AttemptsPage } from "@/lib/student-api";
import { useApi } from "@/lib/use-api";
import { scoreBand } from "./ScoreRing";
import { ScoreTrend } from "./ScoreTrend";
import { SkillSelect } from "./SkillSelect";

/** The api's page cap: trends cover the newest 50 sessions. */
const TREND_PAGE = 50;

const UNSCORED: Record<Exclude<AttemptStatus, "completed">, string> = {
  active: "In progress",
  abandoned: "Not scored",
  ended_by_guard: "Ended early",
  // Never returned by the api; listed so every status has a label.
  starting: "Starting",
};

function historyHref(skill: SkillSlug | undefined, page = 1): string {
  const query = new URLSearchParams();
  if (skill) query.set("skill", skill);
  if (page > 1) query.set("page", String(page));
  const search = query.toString();
  return search ? `/app/history?${search}` : "/app/history";
}

const skillQuery = (skill: SkillSlug | undefined) => (skill ? `&skill=${skill}` : "");

function SkillFilter({ skill }: { skill: SkillSlug | undefined }) {
  const router = useRouter();
  return (
    <SkillSelect
      label="Skill"
      value={skill}
      allLabel="All skills"
      onSelect={(next) => {
        router.push(historyHref(next));
      }}
      className="sm:w-64"
    />
  );
}

function Row({ attempt }: { attempt: AttemptSummary }) {
  const { title } = getSkill(attempt.skill);
  const scored = attempt.status === "completed" && attempt.overall !== null;
  const band = scored ? scoreBand(attempt.overall ?? 0) : null;
  return (
    <li>
      <Link
        href={attemptPath(attempt.id)}
        className="flex items-center gap-4 rounded-control px-3 py-3 hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">{title}</span>
          <span className="block text-small text-muted">{formatLocalDate(attempt.startedAt)}</span>
        </span>
        {band ? (
          <span className="flex items-center gap-3">
            <span className="font-display text-h4 font-bold text-navy tabular-nums">
              {attempt.overall}
              <span className="sr-only"> out of 100</span>
            </span>
            <Badge tone={band.tone} className="max-sm:hidden">
              {band.label}
            </Badge>
          </span>
        ) : (
          <Badge>{attempt.status === "completed" ? "Not scored" : UNSCORED[attempt.status]}</Badge>
        )}
      </Link>
    </li>
  );
}

/** Each skill's scores, oldest first, from a newest-first list of sessions. */
function scoresBySkill(attempts: readonly AttemptSummary[]) {
  const scores = new Map<SkillSlug, number[]>();
  for (const attempt of [...attempts].reverse()) {
    if (attempt.status !== "completed" || attempt.overall === null) continue;
    scores.set(attempt.skill, [...(scores.get(attempt.skill) ?? []), attempt.overall]);
  }
  return SKILLS.flatMap(({ slug, title }) => {
    const list = scores.get(slug);
    return list ? [{ slug, title, scores: list }] : [];
  });
}

function Trends({ skill }: { skill: SkillSlug | undefined }) {
  const recent = useApi(
    `/practice/attempts?pageSize=${String(TREND_PAGE)}${skillQuery(skill)}`,
    AttemptsPage,
  );
  return (
    <Card as="section" aria-labelledby="trends-title" className="flex flex-col gap-4">
      <h2 id="trends-title" className="text-h4">
        Score trends
      </h2>
      {recent.state === "loading" && <Loading label="Loading your score trends" lines={2} />}
      {recent.state === "error" && <LoadError what="your score trends" onRetry={recent.reload} />}
      {recent.state === "ready" &&
        (() => {
          const trends = scoresBySkill(recent.data.items);
          if (trends.length === 0) {
            return <p className="text-ink">Finish a session to start a trend line.</p>;
          }
          return (
            <ul className="flex flex-col gap-4">
              {trends.map((trend) => (
                <li key={trend.slug}>
                  <ScoreTrend skillTitle={trend.title} scores={trend.scores} />
                </li>
              ))}
            </ul>
          );
        })()}
    </Card>
  );
}

interface PracticeHistoryProps {
  skill?: SkillSlug | undefined;
  page: number;
}

/** Every practice session, newest first, with a filter by skill and a score trend per skill. */
export function PracticeHistory({ skill, page }: PracticeHistoryProps) {
  const list = useApi(`/practice/attempts?page=${String(page)}${skillQuery(skill)}`, AttemptsPage);

  if (list.state === "loading") return <Loading label="Loading your sessions" lines={5} />;
  if (list.state === "error") return <LoadError what="your sessions" onRetry={list.reload} />;

  const { items, total, pageSize } = list.data;
  const filter = <SkillFilter skill={skill} />;

  if (total === 0) {
    const title = skill ? getSkill(skill).title : undefined;
    return (
      <div className="flex flex-col gap-6">
        {skill && filter}
        <EmptyState
          icon={<History className="size-6" />}
          title={
            title ? `You haven’t practiced ${title.toLowerCase()} yet` : "No practice sessions yet"
          }
          description="Every session you finish shows up here with its score, so you can see whether you’re getting better."
          action={
            <Link
              href={skill ? `/app/practice/${skill}` : "/app/practice"}
              className={buttonClasses()}
            >
              {title ? `Practice ${title.toLowerCase()}` : "Pick a skill"}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-ink">
          {total === 1 ? "1 session" : `${String(total)} sessions`}, newest first.
        </p>
        {filter}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card flush className="p-3">
          {items.length === 0 ? (
            <p className="p-3 text-ink">
              This page is past the end of the list.{" "}
              <Link
                href={historyHref(skill)}
                className="pp-link rounded-control font-semibold text-primary"
              >
                Go to the first page
              </Link>
            </p>
          ) : (
            <ul aria-label="Practice sessions" className="divide-y divide-border">
              {items.map((attempt) => (
                <Row key={attempt.id} attempt={attempt} />
              ))}
            </ul>
          )}
        </Card>
        <Trends skill={skill} />
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        hrefFor={(target) => historyHref(skill, target)}
      />
    </div>
  );
}
