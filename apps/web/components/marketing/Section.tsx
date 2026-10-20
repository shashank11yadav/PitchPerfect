import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Section grounds. Sections are told apart by a change of ground, never by a rule or a shadow:
 * white, the soft blue tint, navy, and brand blue (kept for the closing call to action).
 */
type Ground = "white" | "soft" | "navy" | "blue";

const GROUNDS: Record<Ground, string> = {
  white: "bg-surface text-ink",
  soft: "bg-primary-soft text-ink",
  navy: "pp-on-dark bg-navy text-white",
  blue: "pp-on-dark bg-primary text-white",
};

/** The page column: one pair of margins and one width for every public page. */
export const WRAP = "mx-auto w-full max-w-wide px-4 sm:px-6 lg:px-8";

interface SectionProps {
  ground?: Ground;
  /** The id of the section's heading. */
  labelledBy?: string;
  className?: string;
  /** Classes for the inner column, e.g. a 12-column grid. */
  innerClassName?: string;
  children: ReactNode;
}

/** A full-width band with the page column inside. */
export function Section({
  ground = "white",
  labelledBy,
  className,
  innerClassName,
  children,
}: SectionProps) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn(GROUNDS[ground], "py-20 md:py-32", className)}
    >
      <div className={cn(WRAP, innerClassName)}>{children}</div>
    </section>
  );
}

interface SectionTitleProps {
  id: string;
  children: ReactNode;
  /** `title` for the one big heading of a section, `section` for a working heading. */
  size?: "title" | "section";
  dark?: boolean;
  className?: string;
}

/** A section's h2. Sentence case, no label above it. */
export function SectionTitle({
  id,
  children,
  size = "section",
  dark = false,
  className,
}: SectionTitleProps) {
  return (
    <h2
      id={id}
      className={cn(
        size === "title" ? "text-title" : "text-section",
        dark ? "text-white" : "text-navy",
        className,
      )}
    >
      {children}
    </h2>
  );
}
