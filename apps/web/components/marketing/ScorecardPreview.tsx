import { RUBRIC_DIMENSIONS } from "@pitchperfect/shared";
import { ArrowDown, CircleCheck, Lightbulb } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { RubricBar } from "@/components/practice/RubricBar";
import { ScoreRing } from "@/components/practice/ScoreRing";
import { cn } from "@/lib/cn";
import {
  SAMPLE_PERSONA,
  SAMPLE_SCORECARD,
  SAMPLE_SKILL_TITLE,
  SAMPLE_WEIGHTED,
} from "./sample-session";

function Points({
  title,
  items,
  icon: Icon,
  iconClass,
}: {
  title: string;
  items: readonly string[];
  icon: LucideIcon;
  iconClass: string;
}) {
  return (
    <div>
      <h4 className="text-small font-bold text-ink">{title}</h4>
      <ul className="mt-3 flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-small text-ink">
            <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", iconClass)} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The sample session's scorecard, laid out like the real one. */
export function ScorecardPreview() {
  const { overall, dimensions, strengths, improvements, strongerLine } = SAMPLE_SCORECARD;
  const byKey = new Map(dimensions.map((dimension) => [dimension.key, dimension]));
  return (
    <article
      aria-labelledby="sample-scorecard-title"
      className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 md:px-8">
        <div>
          <p className="text-caption font-semibold text-muted">Sample scorecard</p>
          <h3 id="sample-scorecard-title" className="text-h4">
            {SAMPLE_SKILL_TITLE} with {SAMPLE_PERSONA.personaName}
          </h3>
        </div>
        <p className="text-small text-muted">Fictional session, real rubric</p>
      </header>

      <div className="grid gap-8 p-5 md:p-8 lg:grid-cols-[15rem_1fr] lg:gap-10">
        <div className="flex flex-col items-center gap-4 text-center lg:border-r lg:border-border lg:pr-10">
          <ScoreRing score={overall} />
          <p className="max-w-56 text-small text-ink">
            {SAMPLE_SKILL_TITLE} counts double in this score, because it is the skill being
            practiced.
          </p>
        </div>
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {RUBRIC_DIMENSIONS.map(({ key, name }) => {
            const dimension = byKey.get(key);
            if (!dimension) return null;
            return (
              <RubricBar
                key={key}
                name={name}
                score={dimension.score}
                justification={dimension.justification}
                evidence={dimension.evidence}
                weighted={key === SAMPLE_WEIGHTED}
              />
            );
          })}
        </div>
      </div>

      <div className="grid gap-8 border-t border-border bg-surface-2 p-5 md:grid-cols-3 md:p-8">
        <Points title="Strengths" items={strengths} icon={CircleCheck} iconClass="text-success" />
        <Points
          title="Improvements"
          items={improvements}
          icon={Lightbulb}
          iconClass="text-warning"
        />
        <div>
          <h4 className="text-small font-bold text-ink">Stronger version</h4>
          <div className="mt-3 rounded-card border border-border bg-surface p-4">
            <p className="text-caption font-semibold text-muted">You said</p>
            <p className="mt-1 text-small text-ink">{strongerLine.original}</p>
            <ArrowDown aria-hidden="true" className="my-2 size-4 text-primary" />
            <p className="text-caption font-semibold text-primary">Try</p>
            <p className="mt-1 text-small font-semibold text-ink">{strongerLine.improved}</p>
          </div>
        </div>
      </div>
    </article>
  );
}
