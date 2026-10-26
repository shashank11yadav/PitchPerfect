import Link from "next/link";
import { InView, InViewItem } from "@/components/motion/in-view";
import { CtaBand } from "@/components/marketing/CtaBand";
import { EmployerField } from "@/components/marketing/EmployerField";
import { EvidenceExplorer } from "@/components/marketing/EvidenceExplorer";
import { Faq } from "@/components/marketing/Faq";
import { HomeHero } from "@/components/marketing/Hero";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { Section, SectionTitle } from "@/components/marketing/Section";
import { SkillsLine } from "@/components/marketing/SkillsList";
import { JsonLd } from "@/components/ui/JsonLd";
import { HOME_FAQ } from "@/content/faq";
import { organizationJsonLd, pageMetadata, PUBLIC_PAGES, websiteJsonLd } from "@/lib/seo";

export const metadata = pageMetadata(PUBLIC_PAGES.home);

export default function HomePage() {
  return (
    <>
      <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
      <HomeHero
        lead={
          <p>
            Run a sales call with a practice partner playing a busy buyer. Your scorecard quotes
            what you actually said, and you can attach it when you apply for a sales job.
          </p>
        }
      />

      <Section labelledBy="evidence-heading" className="pt-8 md:pt-12">
        <InView className="max-w-3xl">
          <InViewItem>
            <SectionTitle id="evidence-heading" size="title" className="max-w-[15ch]">
              Every score points at a line you said
            </SectionTitle>
          </InViewItem>
          <InViewItem>
            <p className="mt-6 max-w-[52ch] text-statement text-ink">
              The call ends with a score out of 100 and seven rubric scores, each with a reason.
              Pick one to see the words it&apos;s based on. Quotes are checked against your
              transcript, so none are made up.
            </p>
          </InViewItem>
        </InView>
        <div className="mt-14 md:mt-20">
          <EvidenceExplorer />
        </div>
        <p className="mt-6 text-small text-ink">
          A sample call with a made-up buyer, Maya Chen. The rubric is the real one.
        </p>
      </Section>

      <HowItWorks />
      <SkillsLine />
      <EmployerField />
      <Faq
        heading="Before you sign up"
        lead={
          <p>
            More on sessions and scoring is on{" "}
            <Link href="/how-it-works" className="pp-link font-semibold text-primary">
              how it works
            </Link>
            .
          </p>
        }
        items={HOME_FAQ}
      />
      <CtaBand />
    </>
  );
}
