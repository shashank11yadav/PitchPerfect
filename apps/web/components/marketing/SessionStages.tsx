import { STAGES, type Stage } from "@pitchperfect/shared";
import type { ReactNode } from "react";
import { InView, InViewItem } from "@/components/motion/in-view";
import { cn } from "@/lib/cn";
import { PracticeRoomPreview, STAGE_LABELS } from "./PracticeRoomPreview";
import { SAMPLE_STAGE } from "./sample-session";
import { Section, SectionTitle } from "./Section";

const STAGE_NOTES: Record<Stage, string> = {
  opening: "Introduce yourself and earn a few minutes.",
  discovery: "Ask about the problem, what it costs them, and who decides.",
  pitch: "Tie what you sell to what they just told you.",
  objection: "They raise the concerns they were holding back.",
  close: "Agree on a next step, or find out what's in the way.",
};

interface StageShowcaseProps {
  title: string;
  children: ReactNode;
}

/**
 * The five stages of a call stacked in display type, the stage the sample call is in at full
 * strength, with the facts under them and the practice room beside them.
 */
export function StageShowcase({ title, children }: StageShowcaseProps) {
  return (
    <Section labelledBy="stages-heading">
      <div className="grid items-start gap-y-14 lg:grid-cols-12 lg:gap-x-6">
        <div className="lg:col-span-6">
          <ol aria-label="The five stages of a call" className="font-display font-bold">
            {STAGES.map((stage) => (
              <li
                key={stage}
                aria-current={stage === SAMPLE_STAGE ? "step" : undefined}
                className={cn(
                  "text-[clamp(2.75rem,7.4vw,7rem)] leading-[1.02] tracking-[-0.045em]",
                  stage === SAMPLE_STAGE ? "text-navy" : "text-navy-300",
                )}
              >
                {STAGE_LABELS[stage]}
              </li>
            ))}
          </ol>
          <InView className="mt-14 max-w-xl">
            <InViewItem>
              <SectionTitle id="stages-heading">{title}</SectionTitle>
            </InViewItem>
            <InViewItem className="mt-5 flex flex-col gap-4 text-lede text-ink">
              {children}
            </InViewItem>
          </InView>
        </div>
        <div className="min-w-0 lg:sticky lg:top-24 lg:col-span-6 lg:col-start-7">
          <PracticeRoomPreview floating />
        </div>
      </div>
    </Section>
  );
}

interface StageStoryProps {
  intro: ReactNode;
  footnote: ReactNode;
}

/** How-it-works: the stages as a list beside a pinned practice room. */
export function StageStory({ intro, footnote }: StageStoryProps) {
  return (
    <Section ground="white" labelledBy="session-heading">
      <div className="grid items-start gap-y-14 lg:grid-cols-12 lg:gap-x-6">
        <div className="lg:col-span-5">
          <SectionTitle id="session-heading" size="title">
            Inside a practice call
          </SectionTitle>
          <div className="mt-6 max-w-[44ch] text-lede text-ink">{intro}</div>
          <InView as="ol" className="mt-12 flex flex-col gap-8">
            {STAGES.map((stage) => (
              <InViewItem key={stage} as="li" className="max-w-[40ch]">
                <span
                  aria-hidden="true"
                  className={cn(
                    "block h-1.5 w-14 rounded-pill",
                    stage === SAMPLE_STAGE ? "bg-primary" : "bg-primary-tint",
                  )}
                />
                <h3 className="mt-3 text-h3 font-bold text-navy">{STAGE_LABELS[stage]}</h3>
                <p className="mt-1 text-lede text-ink">{STAGE_NOTES[stage]}</p>
              </InViewItem>
            ))}
          </InView>
          <div className="mt-12 max-w-[44ch] text-ink">{footnote}</div>
        </div>
        <div className="lg:sticky lg:top-24 lg:col-span-7 lg:col-start-6">
          <PracticeRoomPreview />
        </div>
      </div>
    </Section>
  );
}

const BANDS = [
  { from: 0, to: 49, label: "Needs work", className: "bg-danger" },
  { from: 50, to: 79, label: "Developing", className: "bg-warning" },
  { from: 80, to: 100, label: "Strong", className: "bg-success" },
] as const;

/** The 0–100 scale cut into its three bands at their real widths, with the sample score marked. */
export function ScoreBands({ sample }: { sample: number }) {
  return (
    <figure className="max-w-3xl">
      <figcaption className="sr-only">
        Score bands: 0 to 49 needs work, 50 to 79 developing, 80 to 100 strong. The sample session
        scored {sample}.
      </figcaption>
      <div aria-hidden="true" className="relative pt-8">
        <span
          className="absolute top-0 -translate-x-1/2 text-small font-bold text-navy tabular-nums"
          style={{ left: `${String(sample)}%` }}
        >
          {sample}
        </span>
        <span
          className="absolute top-6 bottom-0 w-0.5 -translate-x-1/2 bg-navy"
          style={{ left: `${String(sample)}%` }}
        />
        <div className="flex h-3 gap-1">
          {BANDS.map(({ from, to, className }) => (
            <span
              key={from}
              className={cn("rounded-pill", className)}
              style={{ flexGrow: to - from + 1, flexBasis: 0 }}
            />
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="mt-3 flex gap-1 text-small text-ink">
        {BANDS.map(({ from, to, label }) => (
          <span key={from} style={{ flexGrow: to - from + 1, flexBasis: 0 }}>
            <span className="block font-bold">{label}</span>
            <span className="tabular-nums">
              {from}–{to}
            </span>
          </span>
        ))}
      </div>
    </figure>
  );
}
