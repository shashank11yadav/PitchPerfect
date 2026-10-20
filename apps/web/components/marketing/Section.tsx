import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SectionProps {
  /** Public pages alternate white and light grey sections. */
  tone?: "white" | "muted";
  /** The id of the section's heading. */
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}

/** A full-width page section with the content column inside. */
export function Section({ tone = "white", labelledBy, className, children }: SectionProps) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn(tone === "muted" ? "bg-surface-2" : "bg-surface", "py-12 md:py-20", className)}
    >
      <div className="mx-auto max-w-content px-4 sm:px-6">{children}</div>
    </section>
  );
}

interface SectionHeadingProps {
  id: string;
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  align?: "left" | "center";
  className?: string;
}

/** A section's h2, with an optional short label above it and a lead paragraph below. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
  align = "left",
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow && <p className="text-small font-bold text-primary">{eyebrow}</p>}
      <h2 id={id} className={cn("text-h3 md:text-h2", eyebrow && "mt-2")}>
        {title}
      </h2>
      {lead && <p className="mt-4 text-body text-ink md:text-h4 md:font-normal">{lead}</p>}
    </div>
  );
}
