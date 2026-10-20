import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
  /** A short extra line, e.g. which rubric dimension counts double. */
  meta?: string;
}

const COLUMNS = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
} as const;

interface FeatureGridProps {
  items: readonly Feature[];
  columns?: keyof typeof COLUMNS;
  /** Smaller cards, for long lists such as the eight skills. */
  dense?: boolean;
  className?: string;
}

/** A grid of icon cards, each with an h3. */
export function FeatureGrid({ items, columns = 3, dense = false, className }: FeatureGridProps) {
  return (
    <ul className={cn("grid gap-4", COLUMNS[columns], className)}>
      {items.map(({ icon: Icon, title, body, meta }) => (
        <li
          key={title}
          className={cn(
            "rounded-card border border-border bg-surface shadow-card",
            dense ? "flex items-start gap-3 p-4" : "flex flex-col gap-3 p-6",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "flex shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary",
              dense ? "size-9" : "size-11",
            )}
          >
            <Icon className={dense ? "size-4.5" : "size-5"} />
          </span>
          <div className={cn("flex flex-col", dense ? "gap-1" : "gap-3")}>
            <h3 className={cn("font-bold text-navy", dense ? "text-body" : "text-h4")}>{title}</h3>
            <p className={cn("text-ink", dense && "text-small")}>{body}</p>
            {meta && <p className="pt-1 text-caption font-semibold text-primary">{meta}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
