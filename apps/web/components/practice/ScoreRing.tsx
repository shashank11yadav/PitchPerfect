"use client";

import { useEffect, useState } from "react";
import { useEntryReveal } from "@/components/motion/use-entry-reveal";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

type BandTone = "success" | "warning" | "danger";

interface ScoreBand {
  label: "Strong" | "Developing" | "Needs work";
  tone: BandTone;
}

/** docs/design-system.md: ≥ 80 strong, 50–79 developing, < 50 needs work. */
export function scoreBand(score: number): ScoreBand {
  if (score >= 80) return { label: "Strong", tone: "success" };
  if (score >= 50) return { label: "Developing", tone: "warning" };
  return { label: "Needs work", tone: "danger" };
}

const STROKE: Record<BandTone, string> = {
  success: "stroke-success",
  warning: "stroke-warning",
  danger: "stroke-danger",
};

const DURATION_MS = 900;
const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * The number to show. Server HTML and a ring already on screen show the final score; only a ring
 * that is still off screen after hydration drops to 0 and counts up once it scrolls into view.
 * Reduced motion always shows the final score.
 */
function useCountUp(target: number) {
  const { ref, phase } = useEntryReveal<HTMLDivElement>();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (phase !== "play") return;
    let frame = 0;
    let start: number | undefined;
    const tick = (now: number) => {
      start ??= now;
      const elapsed = Math.min((now - start) / DURATION_MS, 1);
      setProgress(elapsed);
      if (elapsed < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [phase]);

  const value = phase === "static" ? target : Math.round(target * easeOut(progress));
  return { ref, value };
}

interface ScoreRingProps {
  /** Overall score, 0–100. */
  score: number;
  size?: "sm" | "lg";
  className?: string;
}

/**
 * The overall score as a ring coloured by band, with the band named in text. The server renders
 * the final number; the count-up only runs in the browser and never changes the accessible name.
 */
export function ScoreRing({ score, size = "lg", className }: ScoreRingProps) {
  const band = scoreBand(score);
  const { ref, value } = useCountUp(score);
  const large = size === "lg";

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`Overall score: ${String(score)} out of 100, ${band.label.toLowerCase()}`}
      className={cn("inline-flex flex-col items-center gap-3", className)}
    >
      <div className={cn("relative", large ? "size-40" : "size-14")}>
        <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            strokeWidth="10"
            className="stroke-border"
          />
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - value / 100)}
            className={STROKE[band.tone]}
          />
        </svg>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          aria-hidden="true"
        >
          <span
            data-testid="score-value"
            className={cn(
              "font-display leading-none font-bold text-navy tabular-nums",
              large ? "text-h1" : "text-body",
            )}
          >
            {value}
          </span>
          {large && <span className="mt-1 text-caption text-muted">out of 100</span>}
        </div>
      </div>
      {large && (
        <Badge tone={band.tone} className="text-small">
          {band.label}
        </Badge>
      )}
    </div>
  );
}
