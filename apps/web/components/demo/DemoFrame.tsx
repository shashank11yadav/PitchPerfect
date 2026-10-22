import type { ReactNode } from "react";
import { WRAP } from "@/components/marketing/Section";
import { cn } from "@/lib/cn";

interface DemoFrameProps {
  /** The page's only h1. */
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}

/**
 * The static demo's practice, lesson and history pages sit in the public site's frame instead of
 * the app shell: the page title where the shell's top bar would put it, then the same cards on
 * the same ground.
 */
export function DemoFrame({ title, lead, children }: DemoFrameProps) {
  return (
    <div className="bg-surface-2">
      <div className={cn(WRAP, "py-10 md:py-14")}>
        <h1 className="text-h2 text-navy md:text-h1">{title}</h1>
        {lead && <div className="mt-3 max-w-prose text-lede text-ink">{lead}</div>}
        <div className="mt-8 md:mt-10">{children}</div>
      </div>
    </div>
  );
}
