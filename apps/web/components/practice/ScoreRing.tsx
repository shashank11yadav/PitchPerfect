"use client";

import { useEffect, useRef, useState } from "react";
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

const prefersReducedMotion = () =>
  typeof window.matchMedia !== "function" ||
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Counts from 0 to `target` once the element is on screen, unless motion is reduced. */
function useCountUp(target: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(target);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let frame = 0;
    const run = () => {
      let start: number | undefined;
      const tick = (now: number) => {
        start ??= now;
        const progress = Math.min((now - start) / DURATION_MS, 1);
        setValue(Math.round(target * easeOut(progress)));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    const element = ref.current;
    if (typeof IntersectionObserver !== "function" || !element) {
      run();
      return () => {
        cancelAnimationFrame(frame);
      };
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      run();
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [target]);

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
