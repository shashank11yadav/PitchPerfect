import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface HeroProps {
  eyebrow?: string;
  /** The page's h1. */
  title: ReactNode;
  lead: ReactNode;
  actions?: ReactNode;
  /** Short facts under the actions. */
  footnote?: ReactNode;
  /** The product visual beside the text on wide screens. */
  visual?: ReactNode;
  /** Less vertical space, for inner pages. */
  compact?: boolean;
}

/** Soft circles and a dot grid behind the hero; purely decorative. */
function Backdrop() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 1200 640"
    >
      <defs>
        <radialGradient id="hero-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#3f56d2" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#3f56d2" stopOpacity="0" />
        </radialGradient>
        <pattern id="hero-dots" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.4" fill="#ffffff" fillOpacity="0.09" />
        </pattern>
      </defs>
      <rect width="1200" height="640" fill="url(#hero-dots)" />
      <circle cx="1020" cy="120" r="360" fill="url(#hero-glow)" />
      <circle cx="80" cy="640" r="300" fill="url(#hero-glow)" />
    </svg>
  );
}

/** The navy band at the top of every public page. It holds the page's only h1. */
export function Hero({
  eyebrow,
  title,
  lead,
  actions,
  footnote,
  visual,
  compact = false,
}: HeroProps) {
  return (
    <div className="pp-on-dark relative isolate overflow-hidden bg-linear-to-b from-navy to-navy-900">
      <Backdrop />
      <div
        className={cn(
          "relative mx-auto grid max-w-content items-center gap-12 px-4 sm:px-6",
          compact ? "py-12 md:py-16" : "py-14 md:py-24",
          visual && "lg:grid-cols-[1fr_minmax(0,31rem)] lg:gap-16",
        )}
      >
        <div className="max-w-2xl">
          {eyebrow && (
            <p className="inline-flex rounded-pill bg-white/10 px-3 py-1 text-small font-semibold text-white ring-1 ring-white/20">
              {eyebrow}
            </p>
          )}
          <h1
            className={cn(
              "text-white",
              eyebrow && "mt-5",
              compact
                ? "text-h1 md:text-[3rem] md:leading-[3.5rem]"
                : "text-display-sm md:text-display",
            )}
          >
            {title}
          </h1>
          <div className="mt-5 max-w-xl text-body text-white/85 md:text-h4 md:font-normal">
            {lead}
          </div>
          {actions && <div className="mt-8 flex flex-col gap-3 sm:flex-row">{actions}</div>}
          {footnote && <div className="mt-8">{footnote}</div>}
        </div>
        {visual && <div className="min-w-0">{visual}</div>}
      </div>
    </div>
  );
}
