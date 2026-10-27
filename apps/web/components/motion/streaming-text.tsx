"use client";

import { lazy, Suspense } from "react";
import { cn } from "@/lib/cn";
import { useEntryReveal } from "./use-entry-reveal";

/**
 * The letter-by-letter effect and the animation library behind it, fetched only once a line is
 * found off screen after hydration. A line that renders static (on screen, or reduced motion)
 * never loads either, so they stay out of the scripts a page needs to paint.
 */
const TextEffect = lazy(() =>
  import("./text-effect").then((module) => ({ default: module.TextEffect })),
);

interface StreamingTextProps {
  text: string;
  className?: string;
}

/**
 * A partner reply that arrives letter by letter the first time it scrolls into view, the way the
 * real practice room streams replies. A transparent copy of the line stays in place underneath,
 * so the bubble never changes size and screen readers get the sentence once, as plain text.
 */
export function StreamingText({ text, className }: StreamingTextProps) {
  const { ref, phase } = useEntryReveal<HTMLSpanElement>();
  return (
    <span ref={ref} data-reveal={phase} className={cn("relative block", className)}>
      <span className={phase === "static" ? undefined : "opacity-0"}>{text}</span>
      {phase !== "static" && (
        <span aria-hidden="true" className="absolute inset-0">
          <Suspense fallback={null}>
            <TextEffect
              as="span"
              per="char"
              delay={0.4}
              speedReveal={1.5}
              trigger={phase === "play"}
            >
              {text}
            </TextEffect>
          </Suspense>
        </span>
      )}
    </span>
  );
}
