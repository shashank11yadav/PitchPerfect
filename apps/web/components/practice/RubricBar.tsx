import { useId } from "react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

const MAX_SCORE = 5;

interface RubricBarProps {
  /** The dimension's name, e.g. "Objection handling". */
  name: string;
  score: 1 | 2 | 3 | 4 | 5;
  justification: string;
  /** An exact quote from the student, or null when there is none. */
  evidence: string | null;
  /** The practiced skill's dimension, which counts double in the overall score. */
  weighted?: boolean;
  headingLevel?: "h3" | "h4";
}

/** One rubric dimension: a 1–5 meter, the reason for the score, and the quote behind it. */
export function RubricBar({
  name,
  score,
  justification,
  evidence,
  weighted = false,
  headingLevel: Heading = "h4",
}: RubricBarProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Heading id={id} className="text-small font-bold text-ink">
          {name}
        </Heading>
        {weighted && <Badge tone="info">Counts double</Badge>}
        <span className="ml-auto text-small font-bold text-navy tabular-nums">
          {score}/{MAX_SCORE}
        </span>
      </div>
      <div
        role="meter"
        aria-labelledby={id}
        aria-valuemin={1}
        aria-valuemax={MAX_SCORE}
        aria-valuenow={score}
        aria-valuetext={`${String(score)} out of ${String(MAX_SCORE)}`}
        className="grid grid-cols-5 gap-1"
      >
        {Array.from({ length: MAX_SCORE }, (_, index) => (
          <span
            key={index}
            className={cn("h-2 rounded-pill", index < score ? "bg-primary" : "bg-border")}
          />
        ))}
      </div>
      <p className="text-small text-ink">{justification}</p>
      {evidence && (
        <blockquote className="border-l-2 border-primary/40 pl-3 text-small text-ink italic before:content-['“'] after:content-['”']">
          {evidence}
        </blockquote>
      )}
    </div>
  );
}
