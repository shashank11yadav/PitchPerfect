import Link from "next/link";
import { InView, InViewItem } from "@/components/motion/in-view";
import { CtaBand } from "@/components/marketing/CtaBand";
import { EmployerField } from "@/components/marketing/EmployerField";
import { EvidenceExplorer } from "@/components/marketing/EvidenceExplorer";
import { Faq } from "@/components/marketing/Faq";
import { HomeHero } from "@/components/marketing/Hero";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { Section, SectionTitle } from "@/components/marketing/Section";
import { SkillsList } from "@/components/marketing/SkillsList";
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
            Run a sales call with an AI practice partner playing a busy buyer. Your scorecard quotes
            what you actually said, and you can attach it when you apply for a sales job.
          </p>
        }
      />

      <Section labelledBy="evidence-heading" className="pt-8 md:pt-12">
        <InView className="grid gap-y-6 lg:grid-cols-12 lg:items-end lg:gap-x-6">
          <InViewItem className="lg:col-span-7">
            <SectionTitle id="evidence-heading" size="title" className="max-w-[15ch]">
              Every score points at a line you said
            </SectionTitle>
          </InViewItem>
          <InViewItem className="lg:col-span-4 lg:col-start-9">
            <p className="max-w-[42ch] text-lede text-ink">
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
          A fictional session with Maya Chen, an invented VP of operations. The rubric is the real
          one.
        </p>
      </Section>

      <HowItWorks />
      <SkillsList rubricHref="/students#rubric-heading" />
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
