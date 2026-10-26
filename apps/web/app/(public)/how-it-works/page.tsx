import type { PracticePartnerKind } from "@pitchperfect/shared";
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
import { practiceFaq } from "@/content/faq";
import { SESSION_LENGTH } from "@/content/limits";
import { practicePartnerKind } from "@/lib/practice-partner";
import { pageMetadata, PUBLIC_PAGES } from "@/lib/seo";

export const metadata = pageMetadata(PUBLIC_PAGES.howItWorks);

/** The quote behind the sample call's objection handling score. */
const OBJECTION_QUOTE =
  SAMPLE_SCORECARD.dimensions.find((dimension) => dimension.key === "objections")?.evidence ?? "";

/** What keeps the partner honest, for the partner this deployment really runs. */
const safeguards = (partner: PracticePartnerKind): Statement[] => [
  {
    title: "Always labelled",
    body:
      partner === "live"
        ? "The partner is labelled as AI wherever it appears, and says so if you sincerely ask."
        : "The partner is labelled as a scripted demo wherever it appears, and says so if you sincerely ask.",
  },
  {
    title: "Stays on the call",
    body: "It keeps to the sales scenario and never asks for personal information.",
  },
  {
    title: "Personal details removed",
    body:
      partner === "live"
        ? "Email addresses, phone numbers, card and bank account numbers, and Social Security numbers are removed from your text before it’s stored or sent to our AI provider."
        : partner === "scripted"
          ? "Email addresses, phone numbers, card and bank account numbers, and Social Security numbers are removed from your text before it’s stored. In this demo your text isn’t sent to an AI provider."
          : "Email addresses, phone numbers, card and bank account numbers, and Social Security numbers are removed from your text before it’s kept in this tab. In this demo your text isn’t sent anywhere.",
  },
  {
    title: "Session limits",
    body:
      partner === "browser"
        ? "Each call has a cap on turns and minutes, and the demo counts the calls you start in this tab against the same daily and monthly limits as the full site."
        : "Daily and monthly limits on new sessions keep the partner quick for everyone.",
  },
];

export default async function HowItWorksPage() {
  const partner = await practicePartnerKind();
  return (
    <>
      <PageHero
        title="From a lesson to a scorecard"
        lead={
          <p>
            A lesson, a call with a buyer who pushes back, and a scorecard you can act on. Here’s
            what happens at each step, and where your data goes.
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
        <div className="grid items-end gap-y-10 lg:grid-cols-12 lg:gap-x-6">
          <div className="lg:col-span-5 lg:col-start-8 lg:row-start-1">
            <SectionTitle id="scoring-heading">How scoring works</SectionTitle>
            <p className="mt-4 max-w-[46ch] text-lede text-ink">
              When the call ends, your transcript is scored from 1 to 5 on seven rubric lines. The
              overall score is built from those, with the practiced skill’s line counted twice, and
              scaled to 0 to 100.
            </p>
          </div>
          <figure className="lg:col-span-6 lg:col-start-1 lg:row-start-1">
            <blockquote className="max-w-[22ch] font-display text-[clamp(1.75rem,3vw,2.25rem)] leading-[1.2] font-semibold text-navy">
              “{OBJECTION_QUOTE}”
            </blockquote>
            <figcaption className="mt-4 max-w-[44ch] text-ink">
              The line that earned the sample call its objection handling score, 4 out of 5.
            </figcaption>
          </figure>
        </div>
        <div className="mt-14 grid gap-y-8 md:mt-20 lg:grid-cols-12 lg:gap-x-6">
          <div className="lg:col-span-7">
            <ScoreBands sample={SAMPLE_SCORECARD.overall} />
          </div>
          <p className="max-w-[40ch] text-ink lg:col-span-4 lg:col-start-9">
            Quotes are matched against your transcript before you see them. If the scorer offers a
            line you never said, we drop it.
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
              It plays the buyer and nothing else. These are the rules that keep it there.
            </p>
            <div className="mt-10 max-w-md">
              <RedactionFragment />
            </div>
          </div>
          <StatementRows
            items={safeguards(partner)}
            layout="pinned"
            dark
            className="lg:col-span-7 lg:col-start-6"
          />
        </div>
      </Section>

      <Faq heading="Questions about practice" items={practiceFaq(partner)} />
      <CtaBand />
    </>
  );
}
