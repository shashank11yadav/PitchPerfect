"use client";

import { cn } from "@/lib/cn";
import { TextEffect } from "./text-effect";
import { useEntryReveal } from "./use-entry-reveal";

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
          <TextEffect as="span" per="char" delay={0.4} speedReveal={1.5} trigger={phase === "play"}>
            {text}
          </TextEffect>
        </span>
      )}
    </span>
  );
}
