import type { ReactNode } from "react";
import { InView, InViewItem } from "@/components/motion/in-view";
import { cn } from "@/lib/cn";
import { ApplyFragment, LessonFragment, PracticeFragment } from "./fragments";
import { WRAP } from "./Section";

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

/** Learn → Practice → Get hired. The verbs, set very large, are the headings and the order. */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works-heading">
      <h2 id="how-it-works-heading" className="sr-only">
        How it works
      </h2>
      <ol>
        {STEPS.map(({ verb, body, fragment }, index) => (
          <li key={verb} className={index % 2 === 0 ? "bg-primary-soft" : "bg-surface"}>
            <InView
              className={cn(
                WRAP,
                "grid items-center gap-y-10 py-20 md:py-28 lg:grid-cols-12 lg:gap-x-6",
              )}
            >
              <InViewItem className="lg:col-span-6">
                <h3 className="text-poster font-bold text-navy">{verb}</h3>
              </InViewItem>
              <InViewItem className="lg:col-span-5 lg:col-start-8">
                <p className="max-w-[40ch] text-statement text-ink">{body}</p>
                <div className="mt-8">{fragment}</div>
              </InViewItem>
            </InView>
          </li>
        ))}
      </ol>
    </section>
  );
}
