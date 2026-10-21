import {
  RUBRIC_DIMENSIONS,
  type RubricKey,
  type Scorecard as ScorecardData,
} from "@pitchperfect/shared";
import { ArrowDown, CircleCheck, Lightbulb, type LucideIcon } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { RubricBar } from "./RubricBar";
import { ScoreRing } from "./ScoreRing";

type Level = "h3" | "h4";

function Points({
  title,
  items,
  icon: Icon,
  iconClass,
  headingLevel: Heading,
}: {
  title: string;
  items: readonly string[];
  icon: LucideIcon;
  iconClass: string;
  headingLevel: Level;
}) {
  const id = useId();
  return (
    <div>
      <Heading id={id} className="text-small font-bold text-ink">
        {title}
      </Heading>
      <ul aria-labelledby={id} className="mt-3 flex flex-col gap-2.5">
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

/** Why the ring isn't a plain average. */
function weightNote(weightedName: string, skillTitle: string): string {
  if (weightedName === skillTitle) {
    return `${weightedName} counts double in this score, because it’s the skill being practiced.`;
  }
  return `${weightedName} counts double in this score, since it’s what ${skillTitle.toLowerCase()} is scored on most.`;
}

interface ScorecardDetailsProps {
  scorecard: ScorecardData;
  /** The practiced skill's title and its double-weighted dimension. */
  skillTitle: string;
  weighted: RubricKey;
  /** The level of the section headings inside, one below the scorecard's own title. */
  headingLevel?: Level;
}

/**
 * The body of a scorecard: the overall ring, the seven rubric bars with their reasons and quotes,
 * strengths, improvements, and the stronger version of one line. The app's scorecard page and the
 * public sample both use it.
 */
export function ScorecardDetails({
  scorecard,
  skillTitle,
  weighted,
  headingLevel = "h4",
}: ScorecardDetailsProps) {
  const { overall, dimensions, strengths, improvements, strongerLine } = scorecard;
  const Heading = headingLevel;
  const byKey = new Map(dimensions.map((dimension) => [dimension.key, dimension]));
  const weightedName =
    RUBRIC_DIMENSIONS.find((dimension) => dimension.key === weighted)?.name ?? skillTitle;
  return (
    <>
      <div className="grid gap-8 p-5 md:p-8 lg:grid-cols-[15rem_1fr] lg:gap-10">
        <div
          data-ui
          className="flex flex-col items-center gap-4 text-center lg:border-r lg:border-border lg:pr-10"
        >
          <ScoreRing score={overall} />
          <p className="max-w-56 text-small text-ink">{weightNote(weightedName, skillTitle)}</p>
        </div>
        <div data-ui className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
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
                weighted={key === weighted}
                headingLevel={headingLevel}
              />
            );
          })}
        </div>
      </div>

      <div data-ui className="grid gap-8 bg-surface-2 p-5 md:grid-cols-3 md:p-8">
        <Points
          title="Strengths"
          items={strengths}
          icon={CircleCheck}
          iconClass="text-success"
          headingLevel={headingLevel}
        />
        <Points
          title="Improvements"
          items={improvements}
          icon={Lightbulb}
          iconClass="text-warning"
          headingLevel={headingLevel}
        />
        <div>
          <Heading className="text-small font-bold text-ink">Stronger version</Heading>
          <div className="mt-3 rounded-card bg-surface p-4">
            <p className="text-caption font-semibold text-muted">You said</p>
            <p className="mt-1 text-small text-ink">{strongerLine.original}</p>
            <ArrowDown aria-hidden="true" className="my-2 size-4 text-primary" />
            <p className="text-caption font-semibold text-primary">Try</p>
            <p className="mt-1 text-small font-semibold text-ink">{strongerLine.improved}</p>
          </div>
        </div>
      </div>
    </>
  );
}
