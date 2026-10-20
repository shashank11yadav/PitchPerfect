import { Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  /** Decorative; defaults to an inbox. */
  icon?: ReactNode;
  /** A button or link for the next step. */
  action?: ReactNode;
  headingLevel?: "h2" | "h3";
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  headingLevel: Heading = "h2",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-card border border-dashed border-muted px-6 py-12 text-center",
        className,
      )}
    >
      <div aria-hidden="true" className="rounded-pill bg-primary-soft p-3 text-primary">
        {icon ?? <Inbox className="size-6" />}
      </div>
      <Heading className="text-h4">{title}</Heading>
      {description && <p className="max-w-prose text-ink">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
