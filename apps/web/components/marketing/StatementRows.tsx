import type { ReactNode } from "react";
import { InView, InViewItem } from "@/components/motion/in-view";
import { cn } from "@/lib/cn";

export interface Statement {
  title: string;
  body: ReactNode;
}

interface StatementRowsProps {
  items: readonly Statement[];
  /** `wide`: phrase on the left, sentence on the right. `pinned`: for a column beside a heading. */
  layout?: "wide" | "pinned";
  dark?: boolean;
  className?: string;
}

/** Short phrases with one sentence each, set in rows separated by space. */
export function StatementRows({
  items,
  layout = "wide",
  dark = false,
  className,
}: StatementRowsProps) {
  const wide = layout === "wide";
  return (
    <InView as="ul" className={cn("flex flex-col", wide ? "gap-10 md:gap-14" : "gap-8", className)}>
      {items.map(({ title, body }) => (
        <InViewItem
          key={title}
          as="li"
          className={cn("grid gap-2", wide && "lg:grid-cols-12 lg:items-baseline lg:gap-x-6")}
        >
          <h3
            className={cn(
              "font-bold",
              wide ? "text-section lg:col-span-5" : "text-h3",
              dark ? "text-white" : "text-navy",
            )}
          >
            {title}
          </h3>
          <p
            className={cn(
              "max-w-[46ch] text-lede",
              wide && "lg:col-span-6 lg:col-start-7",
              dark ? "text-white" : "text-ink",
            )}
          >
            {body}
          </p>
        </InViewItem>
      ))}
    </InView>
  );
}
