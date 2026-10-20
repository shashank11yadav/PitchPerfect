import { STAGES, type Stage } from "@pitchperfect/shared";
import { cn } from "@/lib/cn";

export const STAGE_LABELS: Record<Stage, string> = {
  opening: "Opening",
  discovery: "Discovery",
  pitch: "Pitch",
  objection: "Objection",
  close: "Close",
};

interface StageStepperProps {
  /** The stage the call has reached; stages only move forward. */
  stage: Stage;
  className?: string;
}

/** The five call stages as a progress line, the current one marked for screen readers too. */
export function StageStepper({ stage, className }: StageStepperProps) {
  const current = STAGES.indexOf(stage);
  return (
    <ol aria-label="Conversation stages" className={cn("flex gap-1.5", className)}>
      {STAGES.map((step, index) => (
        <li
          key={step}
          aria-current={index === current ? "step" : undefined}
          className="flex min-w-0 flex-1 flex-col gap-1.5"
        >
          <span
            aria-hidden="true"
            className={cn("h-1 rounded-pill", index <= current ? "bg-primary" : "bg-border")}
          />
          <span
            className={cn(
              "truncate text-caption",
              index === current ? "font-bold text-primary" : "text-muted",
            )}
          >
            {STAGE_LABELS[step]}
          </span>
        </li>
      ))}
    </ol>
  );
}
