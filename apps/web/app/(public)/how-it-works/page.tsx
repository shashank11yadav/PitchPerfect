import { CtaBand } from "@/components/marketing/CtaBand";
import { CtaLinks } from "@/components/marketing/CtaLinks";
import { Faq } from "@/components/marketing/Faq";
import { RedactionFragment } from "@/components/marketing/fragments";
import { PageHero } from "@/components/marketing/Hero";
import { StepsInBrief } from "@/components/marketing/HowItWorks";
import { EARLY_MOMENT, SAMPLE_SCORECARD } from "@/components/marketing/sample-session";
import { ScorecardPreview } from "@/components/marketing/ScorecardPreview";
import { Section, SectionTitle } from "@/components/marketing/Section";
import { ScoreBands, StageStory } from "@/components/marketing/SessionStages";
import { StatementRows, type Statement } from "@/components/marketing/StatementRows";
import { PRACTICE_FAQ } from "@/content/faq";
import { SESSION_LENGTH } from "@/content/limits";
import { pageMetadata, PUBLIC_PAGES } from "@/lib/seo";

export const metadata = pageMetadata(PUBLIC_PAGES.howItWorks);

const SAFEGUARDS: Statement[] = [
  {
    title: "Always labelled as AI",
    body: "The partner is marked as AI wherever it appears, and says so if you sincerely ask.",
  },
  {
    title: "Stays on the call",
    body: "It keeps to the sales scenario and never asks for personal information.",
  },
  {
    title: "Contact details removed",
    body: "Email addresses, phone numbers and card-like numbers are removed from your text before it's stored or sent to our AI provider.",
  },
  {
    title: "Session limits",
    body: "Daily and monthly limits on new sessions keep the partner quick for everyone.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHero
        title="From a lesson to a scorecard"
        lead={
          <p>
            A lesson, a call with an AI buyer, and a scorecard you can act on. Here&apos;s what
            happens at each step, and where your data goes.
          </p>
        }
        actions={<CtaLinks />}
      />

      <StepsInBrief />

      <StageStory
        moment={EARLY_MOMENT}
        intro={
          <p>
            Each call starts from a scenario: a buyer with a name, a role, a personality and a few
            objections they keep quiet. Then it moves through five stages.
          </p>
        }
        footnote={
          <p>
            A call is {SESSION_LENGTH}. Talk or type: your browser turns speech into text, and you
            can edit it before you send.
          </p>
        }
      />

      <Section ground="soft" labelledBy="scoring-heading">
        <SectionTitle id="scoring-heading" size="title">
          How scoring works
        </SectionTitle>
        <p className="mt-6 max-w-[58ch] text-statement text-ink">
          When the call ends, your transcript is scored from 1 to 5 on seven rubric lines. The
          overall score is built from those, with the practiced skill&apos;s line counted twice, and
          scaled to 0 to 100.
        </p>
        <div className="mt-14 grid gap-y-8 md:mt-20 lg:grid-cols-12 lg:gap-x-6">
          <div className="lg:col-span-7">
            <ScoreBands sample={SAMPLE_SCORECARD.overall} />
          </div>
          <p className="max-w-[40ch] text-ink lg:col-span-4 lg:col-start-9">
            Every quote on a scorecard is checked word for word against what you said. If the scorer
            suggests a line you never said, it&apos;s removed instead of shown.
          </p>
        </div>
        <div className="mt-14 md:mt-20">
          <ScorecardPreview />
        </div>
      </Section>

      <Section ground="navy" labelledBy="safeguards-heading">
        <div className="grid items-start gap-y-12 lg:grid-cols-12 lg:gap-x-6">
          <div className="lg:col-span-4">
            <SectionTitle id="safeguards-heading" dark>
              The guardrails
            </SectionTitle>
            <p className="mt-6 max-w-[32ch] text-lede text-white">
              The practice partner is useful because it&apos;s honest about what it is.
            </p>
            <div className="mt-10 max-w-md">
              <RedactionFragment />
            </div>
          </div>
          <StatementRows
            items={SAFEGUARDS}
            layout="pinned"
            dark
            className="lg:col-span-7 lg:col-start-6"
          />
        </div>
      </Section>

      <Faq heading="Questions about practice" items={PRACTICE_FAQ} />
      <CtaBand />
    </>
  );
}
