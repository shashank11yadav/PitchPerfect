import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

// Text stays ink on every tone: success and warning colours are below 4.5:1 as text on white.
const TONES: Record<Tone, string> = {
  neutral: "border-border bg-surface-2",
  info: "border-primary/40 bg-primary-soft",
  success: "border-success/40 bg-success/10",
  warning: "border-warning/50 bg-warning/10",
  danger: "border-danger/40 bg-danger/10",
};

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

/** A short text label. Colour is never the only signal: the text says what it means. */
export function Badge({ tone = "neutral", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill border px-2.5 py-0.5 text-caption font-semibold text-ink",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
