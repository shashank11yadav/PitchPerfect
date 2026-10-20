import { Mic } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CtaLinks } from "./CtaLinks";
import { PracticeRoomPreview } from "./PracticeRoomPreview";
import { WRAP } from "./Section";
import { ShaderField } from "./ShaderField";

const LEVELS = [0.55, 0.9, 0.7, 1, 0.6, 0.8];

/**
 * The practice room's voice control, drawn at the size of a word: it sits in the headline where
 * the pitch itself would be. Sized in em, so it scales with the type. Decorative.
 */
function VoiceStrip() {
  return (
    <ShaderField
      aria-hidden="true"
      className="order-first my-3 h-16 w-full rounded-pill sm:order-none sm:my-0 sm:ml-[0.22em] sm:h-[0.74em] sm:w-auto sm:min-w-[2.4em] sm:flex-1 sm:translate-y-[0.04em]"
    >
      <span className="flex h-full items-center gap-4 px-2 sm:gap-[0.16em] sm:px-[0.1em]">
        <span className="flex aspect-square h-12 items-center justify-center rounded-pill bg-white text-navy sm:h-[0.56em]">
          <Mic className="size-6 sm:size-[0.26em]" strokeWidth={2.5} />
        </span>
        <span className="pp-level flex h-6 items-end gap-1 sm:h-[0.3em] sm:gap-[0.06em]">
          {LEVELS.map((level, index) => (
            <span
              key={index}
              className="w-1 rounded-pill bg-white sm:w-[0.07em]"
              style={{ height: `${String(level * 100)}%`, ["--i" as string]: index }}
            />
          ))}
        </span>
      </span>
    </ShaderField>
  );
}

/**
 * The home page's first screen: the tagline set as large as the page allows, the voice strip in
 * its second line, and the practice room rising out of the navy into the section below.
 */
export function HomeHero({ lead }: { lead: ReactNode }) {
  return (
    <div>
      <div className="pp-on-dark bg-navy text-white">
        <div className={cn(WRAP, "pt-12 md:pt-20")}>
          <h1 className="text-hero font-bold text-white">
            <span className="block">Practice your pitch.</span>{" "}
            <span className="flex flex-wrap items-center sm:flex-nowrap">
              <span>Get hired.</span>
              <VoiceStrip />
            </span>
          </h1>
          <div className="mt-10 grid gap-y-12 md:mt-14 lg:grid-cols-12 lg:gap-x-6">
            <div className="lg:col-span-4">
              <div className="max-w-[36ch] text-statement text-white">{lead}</div>
              <CtaLinks className="mt-8" />
            </div>
            <div className="relative z-10 -mb-28 min-w-0 md:-mb-48 lg:col-span-8 lg:col-start-5">
              <PracticeRoomPreview floating />
            </div>
          </div>
        </div>
      </div>
      {/* The white ground the practice room overlaps into. */}
      <div aria-hidden="true" className="h-28 bg-surface md:h-48" />
    </div>
  );
}

interface PageHeroProps {
  /** The page's h1: two lines at most. */
  title: ReactNode;
  lead: ReactNode;
  actions?: ReactNode;
}

/** Inner pages: the title on the left, the lead and actions at the opposite end of its baseline. */
export function PageHero({ title, lead, actions }: PageHeroProps) {
  return (
    <div className="pp-on-dark bg-navy text-white">
      <div
        className={cn(
          WRAP,
          "grid gap-y-8 pt-14 pb-16 md:pt-24 md:pb-24 lg:grid-cols-12 lg:gap-x-6",
        )}
      >
        <h1 className="max-w-[19ch] text-title font-bold text-white lg:col-span-8">{title}</h1>
        <div className="self-end lg:col-span-4 lg:col-start-9">
          <div className="max-w-[44ch] text-lede text-white">{lead}</div>
          {actions && <div className="mt-8">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
