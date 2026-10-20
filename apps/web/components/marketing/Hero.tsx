import { Mic } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CtaLinks } from "./CtaLinks";
import { PracticeRoomPreview } from "./PracticeRoomPreview";
import { WRAP } from "./Section";
import { ShaderField } from "./ShaderField";

const LEVELS = [0.55, 0.9, 0.7, 1, 0.6, 0.8];

/**
 * The practice room's voice control drawn at the size of a word, set just after "Get hired.".
 * It sits outside the h1 (the shader mounts block elements) and is placed in em, so it follows
 * the type at every width. Decorative.
 */
function VoiceStrip() {
  return (
    <ShaderField
      aria-hidden="true"
      className="absolute top-[1.15em] left-[4.82em] h-[0.72em] w-[2.9em] rounded-pill"
    >
      <span className="flex h-full items-center gap-[0.16em] px-[0.09em]">
        <span className="flex aspect-square h-[0.54em] items-center justify-center rounded-pill bg-white text-navy">
          <Mic className="size-[0.26em]" strokeWidth={2.5} />
        </span>
        <span className="pp-level flex h-[0.3em] items-end gap-[0.07em]">
          {LEVELS.map((level, index) => (
            <span
              key={index}
              className="w-[0.07em] min-w-[2px] rounded-pill bg-white"
              style={{ height: `${String(level * 100)}%`, ["--i" as string]: index }}
            />
          ))}
        </span>
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
          <div className="relative text-hero">
            <h1 className="text-hero font-bold text-white">
              <span className="block">Practice your pitch.</span>{" "}
              <span className="block">Get hired.</span>
            </h1>
            <VoiceStrip />
          </div>
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
