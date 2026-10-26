import type { ReactNode } from "react";
import { InView, InViewItem } from "@/components/motion/in-view";
import { cn } from "@/lib/cn";
import { ApplyFragment, LessonFragment, PracticeFragment } from "./fragments";
import { WRAP } from "./Section";

const BRIEF = [
  {
    verb: "Learn",
    body: "Read a short lesson on one skill, with a framework, a worked example and the usual mistakes.",
  },
  {
    verb: "Practice",
    body: "Run the call with a buyer who reacts to what you say, by voice or by typing.",
  },
  {
    verb: "Get hired",
    body: "Read your scorecard, then apply for sales roles and attach the one you're proudest of.",
  },
] as const;

const STEPS: readonly { verb: string; body: string; fragment: ReactNode }[] = [
  {
    verb: "Learn",
    body: "Read a short lesson on one skill: a framework, a worked example, and the mistakes people usually make.",
    fragment: <LessonFragment />,
  },
  {
    verb: "Practice",
    body: "Call a buyer with a name, a job and a few objections they won't mention up front. Talk or type, and stop when you like.",
    fragment: <PracticeFragment />,
  },
  {
    verb: "Get hired",
    body: "Apply to entry-level sales roles and attach the scorecard you're proudest of. You pick which one, or none.",
    fragment: <ApplyFragment />,
  },
];

/** Each step starts lower than the last, so the three read as a sequence, not a row of cards. */
const STEP_OFFSETS = ["", "lg:mt-24", "lg:mt-48"];

/**
 * Home: Learn → Practice → Get hired as one staggered sequence. The verbs are the headings; each
 * carries one sentence and a piece of the product.
 */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works-heading" className="bg-primary-soft py-20 md:py-28">
      <h2 id="how-it-works-heading" className="sr-only">
        How it works
      </h2>
      <InView as="ol" className={cn(WRAP, "grid gap-y-16 lg:grid-cols-12 lg:gap-x-6")}>
        {STEPS.map(({ verb, body, fragment }, index) => (
          <InViewItem key={verb} as="li" className={cn("lg:col-span-4", STEP_OFFSETS[index])}>
            <h3 className="text-section font-bold text-navy">{verb}</h3>
            <p className="mt-3 max-w-[34ch] text-lede text-ink">{body}</p>
            <div className="mt-6 max-w-md">{fragment}</div>
          </InViewItem>
        ))}
      </InView>
    </section>
  );
}

/** How-it-works page: the three steps in brief, as one full-width statement. */
export function StepsInBrief() {
  return (
    <section aria-labelledby="steps-heading" className="bg-primary-soft py-16 md:py-24">
      <div className={WRAP}>
        <h2 id="steps-heading" className="sr-only">
          The three steps
        </h2>
        <InView
          as="ol"
          className="flex max-w-5xl flex-col gap-5 text-[clamp(1.375rem,2.5vw,2.125rem)] leading-[1.3] text-ink"
        >
          {BRIEF.map(({ verb, body }) => (
            <InViewItem key={verb} as="li">
              <strong className="font-bold text-navy">{verb}.</strong> {body}
            </InViewItem>
          ))}
        </InView>
      </div>
    </section>
  );
}
