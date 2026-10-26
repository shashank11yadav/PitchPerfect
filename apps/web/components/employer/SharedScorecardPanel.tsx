"use client";

import { getSkill, LIMITS, type SharedScorecardView } from "@pitchperfect/shared";
import { ScorecardDetails } from "@/components/practice/ScorecardDetails";
import { LoadError, Loading } from "@/components/ui/LoadState";
import { ApiError } from "@/lib/api";
import { SharedScorecard } from "@/lib/employer-api";
import { formatLocalDate } from "@/lib/local-time";
import { useApi } from "@/lib/use-api";

const PARTNER_LABELS: Record<SharedScorecardView["partner"], string> = {
  live: "AI practice partner",
  scripted: "Scripted demo partner",
};

/** "45 s", "4 min", "4 min 10 s". */
function formatCallLength(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${String(rest)} s`;
  return rest === 0 ? `${String(minutes)} min` : `${String(minutes)} min ${String(rest)} s`;
}

/** What the score rests on: how many turns the student took, who answered, and for how long. */
function CallFacts({ shared, firstName }: { shared: SharedScorecardView; firstName: string }) {
  const { studentTurns, partner, durationSeconds } = shared;
  const facts: [string, string][] = [
    [`${firstName}’s turns`, String(studentTurns)],
    ["Partner", PARTNER_LABELS[partner]],
    ...(durationSeconds === null
      ? []
      : ([["Call length", formatCallLength(durationSeconds)]] as [string, string][])),
  ];
  return (
    <div className="flex flex-col gap-2">
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-small">
        {facts.map(([term, value]) => (
          <div key={term} className="flex gap-1.5">
            <dt className="text-muted">{term}</dt>
            <dd className="font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {partner === "scripted" && (
        <p className="max-w-prose text-small text-muted">
          The scripted partner answers from a fixed set of lines, so it pushes back less than a live
          model would.
        </p>
      )}
      {studentTurns < LIMITS.shareMinStudentTurns && (
        <p className="max-w-prose rounded-control border border-warning/50 bg-warning/10 px-3 py-2 text-small text-ink">
          A short call: {firstName} shared it before a scorecard needed at least{" "}
          {LIMITS.shareMinStudentTurns} turns, so the scores rest on very little.
        </p>
      )}
    </div>
  );
}

/** The scorecard the student attached, read-only. Asked for only when one was shared. */
export function SharedScorecardPanel({
  applicationId,
  firstName,
}: {
  applicationId: string;
  firstName: string;
}) {
  const shared = useApi(
    `/employer/applications/${encodeURIComponent(applicationId)}/scorecard`,
    SharedScorecard,
  );
  if (shared.state === "loading") return <Loading label="Loading the scorecard" lines={4} />;
  if (shared.state === "error") {
    if (shared.error instanceof ApiError && shared.error.status === 404) {
      return <p className="text-ink">No scorecard shared</p>;
    }
    return <LoadError what="the scorecard" onRetry={shared.reload} />;
  }
  const { scorecard, skill, completedAt } = shared.data;
  const { title, weighted } = getSkill(skill);
  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-prose text-small text-ink">
        {firstName} attached this scorecard from a {title.toLowerCase()} practice call
        {completedAt ? `, ${formatLocalDate(completedAt)}` : ""}. The quotes are their own words
        from that call.
      </p>
      <CallFacts shared={shared.data} firstName={firstName} />
      <div className="overflow-hidden rounded-card border border-border">
        <ScorecardDetails
          scorecard={scorecard}
          skillTitle={title}
          weighted={weighted}
          headingLevel="h4"
        />
      </div>
    </div>
  );
}
