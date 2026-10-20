import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "article" | "li";
  /** Lifts the shadow on hover, for cards that are links. */
  interactive?: boolean;
}

export function Card({ as: Tag = "div", interactive = false, className, ...props }: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-card border border-border bg-surface p-6 shadow-card",
        interactive && "transition-shadow hover:shadow-card-hover",
        className,
      )}
      {...props}
    />
  );
}
