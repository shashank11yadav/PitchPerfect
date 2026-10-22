"use client";

import { LIMITS, getSkill, type AttemptView } from "@pitchperfect/shared";
import { History } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadError, Loading } from "@/components/ui/LoadState";
import { ApiError } from "@/lib/api";
import { formatLocalDate } from "@/lib/local-time";
import { END_NOTICES, unscoredReason } from "@/lib/practice/practice-reducer";
import { withoutOpening } from "@/lib/practice/use-practice-room";
import { historyHref, practiceHref } from "@/lib/practice/paths";
import { OneAttempt } from "@/lib/student-api";
import { useApi } from "@/lib/use-api";
import { DeleteAttempt } from "./DeleteAttempt";
import { PracticeRoom } from "./PracticeRoom";
import { Scorecard } from "./Scorecard";
import { TranscriptBubble } from "./TranscriptBubble";

/** A session that ended without a scorecard: what happened, the transcript, and what next. */
function UnscoredAttempt({ attempt }: { attempt: AttemptView }) {
  const { title } = getSkill(attempt.skill);
  const persona = attempt.scenarioPublic.personaName;
  const reason = unscoredReason(attempt);
  const why =
    reason === "guard_limit"
      ? "This session ended early because several messages were off the call."
      : reason === "replaced"
        ? "This call stopped when you started a new one, so it wasn’t scored."
        : END_NOTICES.abandoned;
  return (
    <Card as="article" aria-labelledby="unscored-title" className="flex flex-col gap-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-caption font-semibold text-muted">
            {formatLocalDate(attempt.startedAt)}
          </p>
          <h2 id="unscored-title" className="text-h3">
            {title} with {persona}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href={practiceHref(attempt.skill)} className={buttonClasses()}>
            Practice again
          </Link>
          <DeleteAttempt attemptId={attempt.id} />
        </div>
      </div>
      <p className="max-w-prose text-ink">{why}</p>
      <ul aria-label="Transcript" className="flex flex-col gap-2.5 rounded-card bg-surface-2 p-4">
        <TranscriptBubble
          from="partner"
          speaker={persona}
          text={attempt.scenarioPublic.openingLine}
        />
        {withoutOpening(attempt).map((entry, index) => (
          <TranscriptBubble
            key={index}
            from={entry.role}
            speaker={entry.role === "student" ? "You" : persona}
            text={entry.text}
            flagged={entry.flagged === true}
          />
        ))}
      </ul>
    </Card>
  );
}

/** `/app/practice/attempt/[id]`: the room while a session runs, its scorecard once it's done. */
export function AttemptScreen({ id }: { id: string }) {
  const attempt = useApi(`/practice/sessions/${encodeURIComponent(id)}`, OneAttempt);

  if (attempt.state === "loading") return <Loading label="Loading the session" lines={6} />;
  if (attempt.state === "error") {
    const { error } = attempt;
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      return (
        <EmptyState
          icon={<History className="size-6" />}
          title="We can’t find that session"
          description={`It may have been deleted, or it’s older than ${String(LIMITS.attemptRetentionDays)} days.`}
          action={
            <Link href={historyHref()} className={buttonClasses()}>
              See your sessions
            </Link>
          }
        />
      );
    }
    return <LoadError what="this session" onRetry={attempt.reload} />;
  }

  const view = attempt.data;
  switch (view.status) {
    case "starting":
      // The api never returns a start that is still planning; show it as loading if it did.
      return <Loading label="Loading the session" lines={6} />;
    case "active":
      return <PracticeRoom attempt={view} />;
    case "completed":
      return view.scorecard ? <Scorecard attempt={view} /> : <UnscoredAttempt attempt={view} />;
    case "abandoned":
    case "ended_by_guard":
      return <UnscoredAttempt attempt={view} />;
  }
}
