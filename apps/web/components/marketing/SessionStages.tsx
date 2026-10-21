import { STAGES, type Stage } from "@pitchperfect/shared";
import type { ReactNode } from "react";
import { InView, InViewItem } from "@/components/motion/in-view";
import { cn } from "@/lib/cn";
import { STAGE_LABELS } from "@/components/practice/StageStepper";
import { PracticeRoomPreview } from "./PracticeRoomPreview";
import type { RoomMoment } from "./sample-session";
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
  moment: RoomMoment;
  children: ReactNode;
}

/**
 * The heading, then the five stages of a call stacked in display type with the stage the sample
 * call is in at full strength, then the facts; the practice room sits beside them.
 */
export function StageShowcase({ title, moment, children }: StageShowcaseProps) {
  return (
    <Section labelledBy="stages-heading">
      <div className="grid items-start gap-y-14 lg:grid-cols-12 lg:gap-x-6">
        <div className="lg:col-span-6">
          <SectionTitle id="stages-heading">{title}</SectionTitle>
          <ol aria-label="The five stages of a call" className="mt-8 font-display font-bold">
            {STAGES.map((stage) => (
              <li
                key={stage}
                aria-current={stage === moment.stage ? "step" : undefined}
                className={cn(
                  "text-[clamp(2.75rem,7vw,6.5rem)] leading-[1.02] tracking-[-0.045em]",
                  stage === moment.stage ? "text-navy" : "text-navy-300",
                )}
              >
                {STAGE_LABELS[stage]}
              </li>
            ))}
          </ol>
          <InView className="mt-10 flex max-w-xl flex-col gap-4 text-lede text-ink">
            <InViewItem className="flex flex-col gap-4">{children}</InViewItem>
          </InView>
        </div>
        <div className="min-w-0 lg:sticky lg:top-24 lg:col-span-6 lg:col-start-7">
          <PracticeRoomPreview moment={moment} floating />
        </div>
      </div>
    </Section>
  );
}

interface StageStoryProps {
  moment: RoomMoment;
  intro: ReactNode;
  footnote: ReactNode;
}

/**
 * How-it-works: the heading and its lead across the top, then the stages as a list beside the
 * practice room, with the session facts under the room so neither column runs on alone.
 */
export function StageStory({ moment, intro, footnote }: StageStoryProps) {
  return (
    <Section ground="white" labelledBy="session-heading">
      <div className="grid items-end gap-y-5 lg:grid-cols-12 lg:gap-x-6">
        <SectionTitle id="session-heading" className="lg:col-span-6">
          Inside a practice call
        </SectionTitle>
        <div className="max-w-[44ch] text-lede text-ink lg:col-span-5 lg:col-start-8">{intro}</div>
      </div>
      <div className="mt-12 grid items-start gap-y-12 md:mt-16 lg:grid-cols-12 lg:gap-x-6">
        <InView as="ol" className="flex flex-col gap-7 lg:col-span-4">
          {STAGES.map((stage) => (
            <InViewItem key={stage} as="li" className="max-w-[40ch]">
              <span
                aria-hidden="true"
                className={cn(
                  "block h-1.5 w-14 rounded-pill",
                  stage === moment.stage ? "bg-primary" : "bg-primary-tint",
                )}
              />
              <h3 className="mt-3 text-h4 font-bold text-navy">{STAGE_LABELS[stage]}</h3>
              <p className="mt-1 text-ink">{STAGE_NOTES[stage]}</p>
            </InViewItem>
          ))}
        </InView>
        <div className="min-w-0 lg:col-span-8 lg:col-start-5">
          <PracticeRoomPreview moment={moment} />
          <div className="mt-8 max-w-[52ch] text-ink">{footnote}</div>
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
