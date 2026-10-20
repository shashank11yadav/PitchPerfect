import { Check } from "lucide-react";
import Link from "next/link";
import { CtaBand } from "@/components/marketing/CtaBand";
import { CtaLinks } from "@/components/marketing/CtaLinks";
import { Faq } from "@/components/marketing/Faq";
import { ForEmployers } from "@/components/marketing/ForEmployers";
import { ForStudents } from "@/components/marketing/ForStudents";
import { Hero } from "@/components/marketing/Hero";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { PracticeRoomPreview } from "@/components/marketing/PracticeRoomPreview";
import { ScorecardPreview } from "@/components/marketing/ScorecardPreview";
import { Section, SectionHeading } from "@/components/marketing/Section";
import { JsonLd } from "@/components/ui/JsonLd";
import { HOME_FAQ } from "@/content/faq";
import { organizationJsonLd, pageMetadata, PUBLIC_PAGES, websiteJsonLd } from "@/lib/seo";

export const metadata = pageMetadata(PUBLIC_PAGES.home);

const FACTS = ["Voice or text", "Eight sales skills", "Scored on a seven-part rubric"];

export default function HomePage() {
  return (
    <>
      <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
      <Hero
        eyebrow="Sales practice with an AI practice partner"
        title={
          <>
            <span className="block">Practice your pitch.</span>{" "}
            <span className="block text-primary-soft">Get hired.</span>
          </>
        }
        lead={
          <p>
            Speak to an AI practice partner that plays a realistic buyer. Get a scorecard with
            quotes from your own words, then apply to roles with employers who can see your skills.
          </p>
        }
        actions={<CtaLinks />}
        footnote={
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-small text-white/85">
            {FACTS.map((fact) => (
              <li key={fact} className="inline-flex items-center gap-2">
                <Check aria-hidden="true" className="size-4 text-white" />
                {fact}
              </li>
            ))}
          </ul>
        }
        visual={<PracticeRoomPreview />}
      />
      <HowItWorks />
      <ForStudents />
      <ForEmployers />
      <Section tone="muted" labelledBy="scorecard-heading">
        <SectionHeading
          id="scorecard-heading"
          eyebrow="Sample scorecard"
          title="Feedback that points at what you actually said"
          lead="Every session ends with a score out of 100, seven rubric scores with reasons, and a stronger way to say one of your lines."
          align="center"
        />
        <div className="mt-10">
          <ScorecardPreview />
        </div>
      </Section>
      <Faq
        heading="Questions, answered"
        lead={
          <>
            More detail on sessions and scoring is on{" "}
            <Link href="/how-it-works" className="font-semibold text-primary underline">
              how it works
            </Link>
            .
          </>
        }
        items={HOME_FAQ}
      />
      <CtaBand />
    </>
  );
}
