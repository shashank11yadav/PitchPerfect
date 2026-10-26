import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { PAGES_EXPORT } from "@/lib/pages-export";

export interface CtaLink {
  href: string;
  label: string;
}

// The static demo has no accounts: its way in is the practice room, and the board beside it.
const START_PRACTICING: CtaLink = {
  href: PAGES_EXPORT ? "/practice" : "/signup/student",
  label: "Start practicing",
};
const IM_HIRING: CtaLink = PAGES_EXPORT
  ? { href: "/jobs", label: "Browse the jobs" }
  : { href: "/employers", label: "I’m hiring" };

interface CtaLinksProps {
  primary?: CtaLink;
  secondary?: CtaLink;
  /** Navy and blue grounds get the white button. */
  dark?: boolean;
  className?: string;
}

/** One button for the main action and a plain text link for the other. */
export function CtaLinks({
  primary = START_PRACTICING,
  secondary = IM_HIRING,
  dark = true,
  className,
}: CtaLinksProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-7 gap-y-4", className)}>
      <Link
        href={primary.href}
        className={buttonClasses({ variant: dark ? "inverse" : "primary", size: "lg" })}
      >
        {primary.label}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
      <Link
        href={secondary.href}
        className={cn(
          "pp-link rounded-control py-2 font-semibold",
          dark ? "text-white" : "text-primary",
        )}
      >
        {secondary.label}
      </Link>
    </div>
  );
}
