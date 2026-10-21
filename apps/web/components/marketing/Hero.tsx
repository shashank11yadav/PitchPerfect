import { Mic } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CtaLinks } from "./CtaLinks";
import { PracticeRoomPreview } from "./PracticeRoomPreview";
import { WRAP } from "./Section";
import { ShaderField } from "./ShaderField";

const LEVELS = [0.55, 0.9, 0.7, 1, 0.6, 0.8, 0.45];

/**
 * The practice room's voice control, drawn at the size of a word right after "Get hired.". It is
 * an inline span inside the h1, so it follows the words wherever they wrap; sizes are in em with a
 * floor, so on a phone it is still a clear 40 px mic control. Decorative: hidden from assistive
 * tech, and it adds no text to the heading.
 */
function VoiceStrip() {
  return (
    <ShaderField
      aria-hidden="true"
      className="ml-[0.2em] inline-flex h-[max(0.72em,2.5rem)] -translate-y-[0.08em] items-center gap-[max(0.16em,0.5rem)] rounded-pill pr-[max(0.24em,0.875rem)] pl-[max(0.09em,0.25rem)] align-middle outline-1 -outline-offset-1 outline-white/30"
    >
      <span className="flex aspect-square h-[max(0.54em,2rem)] items-center justify-center rounded-pill bg-white text-navy">
        <Mic className="size-[max(0.26em,1.125rem)]" strokeWidth={2.5} />
      </span>
      <span className="pp-level flex h-[max(0.3em,1.125rem)] items-end gap-[max(0.07em,3px)]">
        {LEVELS.map((level, index) => (
          <span
            key={index}
            className="w-[max(0.07em,3px)] rounded-pill bg-white"
            style={{ height: `${String(level * 100)}%`, ["--i" as string]: index }}
          />
        ))}
      </span>
    </ShaderField>
  );
}

/**
 * The home page's first screen: the tagline set as large as the page allows, the voice strip
 * after its last word, and the practice room rising out of the navy into the section below.
 */
export function HomeHero({ lead }: { lead: ReactNode }) {
  return (
    <div>
      <div className="pp-on-dark bg-navy text-white">
        <div className={cn(WRAP, "pt-12 md:pt-20")}>
          <h1 className="text-hero font-bold text-white">
            <span className="block">Practice your pitch.</span>{" "}
            <span className="inline-block whitespace-nowrap">
              Get hired.
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
