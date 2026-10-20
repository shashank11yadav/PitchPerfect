import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "article" | "aside" | "li";
  /** Lifts the shadow on hover, for cards that are links. */
  interactive?: boolean;
  /** No padding, for cards whose content runs edge to edge (bands, lists). */
  flush?: boolean;
}

export function Card({
  as: Tag = "div",
  interactive = false,
  flush = false,
  className,
  ...props
}: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-card border border-border bg-surface shadow-card",
        !flush && "p-6",
        interactive && "transition-shadow hover:shadow-card-hover",
        className,
      )}
      {...props}
    />
  );
}
