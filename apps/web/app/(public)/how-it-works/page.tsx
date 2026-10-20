import { ShieldCheck } from "lucide-react";
import { CtaBand } from "@/components/marketing/CtaBand";
import { Faq } from "@/components/marketing/Faq";
import { Hero } from "@/components/marketing/Hero";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { PracticeRoomPreview } from "@/components/marketing/PracticeRoomPreview";
import { ScorecardPreview } from "@/components/marketing/ScorecardPreview";
import { Section, SectionHeading } from "@/components/marketing/Section";
import { PRACTICE_FAQ } from "@/content/faq";
import { cn } from "@/lib/cn";
import { pageMetadata, PUBLIC_PAGES } from "@/lib/seo";

export const metadata = pageMetadata(PUBLIC_PAGES.howItWorks);

const STAGES = [
  { title: "Opening", body: "Introduce yourself and earn a few minutes of attention." },
  {
    title: "Discovery",
    body: "Ask questions that uncover the problem, its impact and who decides.",
  },
  { title: "Pitch", body: "Connect what you offer to what the buyer just told you." },
  { title: "Objection", body: "The buyer raises the concerns they were holding back." },
  { title: "Close", body: "Agree on a concrete next step, or find out what stands in the way." },
];

const BANDS = [
  { range: "80–100", label: "Strong", className: "bg-success" },
  { range: "50–79", label: "Developing", className: "bg-warning" },
  { range: "0–49", label: "Needs work", className: "bg-danger" },
];

const SAFEGUARDS = [
  "The partner is always labelled as AI, and says so if you sincerely ask.",
  "It stays in the sales scenario and never asks for personal information.",
  "Email addresses, phone numbers and card-like numbers are removed from your text before it is stored or sent to our AI provider.",
  "Daily and monthly session limits keep the partner fast and available for everyone.",
];

export default function HowItWorksPage() {
  return (
    <>
      <Hero
        compact
        eyebrow="How it works"
        title="How PitchPerfect works"
        lead={
          <p>
            A lesson, a conversation with an AI practice partner, and a scorecard you can act on.
            Here is what happens at each step, and what happens to your data.
          </p>
        }
      />

      <HowItWorks />

      <Section tone="muted" labelledBy="session-heading">
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              id="session-heading"
              title="Inside a practice session"
              lead="Each session starts with a scenario: a buyer with a name, a role, a personality and a few objections they keep to themselves. The conversation then moves forward through five stages."
            />
            <ol className="mt-8 flex flex-col gap-4">
              {STAGES.map(({ title, body }, index) => (
                <li key={title} className="flex gap-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-primary font-display text-small font-bold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-body font-bold">{title}</h3>
                    <p className="text-ink">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-8 text-ink">
              A session is up to 20 of your turns or 20 minutes, with up to 1,000 characters per
              turn. Talk or type: your browser turns speech into text, and you can edit it before
              you send.
            </p>
          </div>
          <PracticeRoomPreview />
        </div>
      </Section>

      <Section labelledBy="scoring-heading">
        <SectionHeading
          id="scoring-heading"
          title="How scoring works"
          lead="When the session ends, your transcript is scored on seven rubric dimensions from 1 to 5. The overall score is calculated from those, with the practiced skill's dimension counted twice, and mapped onto 0 to 100."
        />
        <ul className="mt-8 flex flex-wrap gap-3">
          {BANDS.map(({ range, label, className }) => (
            <li
              key={label}
              className="inline-flex items-center gap-2 rounded-pill border border-border bg-surface px-4 py-2 text-small text-ink"
            >
              <span aria-hidden="true" className={cn("size-2.5 rounded-pill", className)} />
              <span className="font-bold">{label}</span> {range}
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-2xl text-ink">
          Every quote on a scorecard is checked word for word against what you said. If the scorer
          suggests a quote you never said, it is removed instead of shown.
        </p>
        <div className="mt-10">
          <ScorecardPreview />
        </div>
      </Section>

      <Section tone="muted" labelledBy="safeguards-heading">
        <SectionHeading
          id="safeguards-heading"
          title="Built-in safeguards"
          lead="The practice partner is useful because it is honest about what it is."
        />
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {SAFEGUARDS.map((point) => (
            <li
              key={point}
              className="flex gap-3 rounded-card border border-border bg-surface p-5 text-ink shadow-card"
            >
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
              {point}
            </li>
          ))}
        </ul>
      </Section>

      <Faq heading="Practice questions" items={PRACTICE_FAQ} />
      <CtaBand />
    </>
  );
}
