"use client";

import { getSkill, type AttemptView } from "@pitchperfect/shared";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatLocalDate } from "@/lib/local-time";
import { PAGES_EXPORT } from "@/lib/pages-export";
import { practiceHref } from "@/lib/practice/paths";
import { DeleteAttempt } from "./DeleteAttempt";
import { ScorecardDetails } from "./ScorecardDetails";
import { ShareScorecard } from "./ShareScorecard";

interface ScorecardProps {
  attempt: AttemptView;
  /** Given when the scorecard replaced the room in place: Practice again resets that room. */
  onPracticeAgain?: (() => void) | undefined;
}

/** A finished, scored session: the scorecard, then what the student can do with it. */
export function Scorecard({ attempt, onPracticeAgain }: ScorecardProps) {
  const { scorecard } = attempt;
  if (!scorecard) return null;
  const skill = getSkill(attempt.skill);

  return (
    <div className="flex flex-col gap-6">
      <Card as="article" flush aria-labelledby="scorecard-title" className="overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 md:px-8">
          <div>
            <p className="text-caption font-semibold text-muted">
              Scorecard, {formatLocalDate(attempt.endedAt ?? attempt.startedAt)}
            </p>
            <h2 id="scorecard-title" className="text-h3">
              {skill.title} with {attempt.scenarioPublic.personaName}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {onPracticeAgain ? (
              <button type="button" onClick={onPracticeAgain} className={buttonClasses()}>
                Practice again
              </button>
            ) : (
              <Link
                href={practiceHref(attempt.skill, attempt.jobId ?? undefined)}
                className={buttonClasses()}
              >
                Practice again
              </Link>
            )}
            <DeleteAttempt attemptId={attempt.id} />
          </div>
        </header>
        <ScorecardDetails
          scorecard={scorecard}
          skillTitle={skill.title}
          weighted={skill.weighted}
          headingLevel="h3"
        />
      </Card>

      {/* Sharing needs an application, which the static demo has no way to make. */}
      {!PAGES_EXPORT && (
        <Card as="section" aria-labelledby="share-title" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="share-title" className="text-h4">
              Share with an application
            </h2>
            <p className="max-w-prose text-ink">
              The employer sees the scores, the reasons and the lines quoted here, not the whole
              transcript. You can stop sharing at any time.
            </p>
          </div>
          <ShareScorecard attemptId={attempt.id} />
        </Card>
      )}
    </div>
  );
}
