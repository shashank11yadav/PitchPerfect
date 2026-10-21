import { CtaBand } from "@/components/marketing/CtaBand";
import { PageHero } from "@/components/marketing/Hero";
import { Section, SectionTitle } from "@/components/marketing/Section";
import { StatementRows } from "@/components/marketing/StatementRows";
import { COPY_LIMITS as L } from "@/content/limits";
import { pageMetadata, PUBLIC_PAGES } from "@/lib/seo";

export const metadata = pageMetadata(PUBLIC_PAGES.about);

const BELIEFS = [
  {
    title: "The partner says it’s AI",
    body: "It plays a believable buyer, but it never claims to be a person, and it tells you what it is if you ask.",
  },
  {
    title: "Every score has a reason",
    body: "A number on its own teaches you nothing. Each rubric line comes with the reason for it, and quotes are checked against what you said.",
  },
  {
    title: "Practice you can show",
    body: "A résumé says where you studied. A shared scorecard shows how you handle a buyer, and you pick who sees it.",
  },
  {
    title: "Private until you share",
    body: `Employers see a scorecard only if you attach it to an application. Transcripts expire after ${L.retentionDays} days, and deleting your account deletes your data.`,
  },
] as const;

export default function AboutPage() {
  return (
    <>
      <PageHero
        title="Sales is learned out loud"
        lead={
          <p>
            PitchPerfect helps people starting out in sales practice the conversations the job is
            made of, and helps employers find the ones who have.
          </p>
        }
      />

      <Section labelledBy="why-heading" innerClassName="grid gap-y-8 lg:grid-cols-12 lg:gap-x-6">
        <SectionTitle id="why-heading" size="title" className="lg:col-span-4">
          Why it exists
        </SectionTitle>
        <div className="flex max-w-[60ch] flex-col gap-5 text-statement text-ink lg:col-span-7 lg:col-start-6">
          <p>
            You learn sales by doing it. The trouble is that most people&apos;s first real attempts
            happen in an interview or on a live call, where a fumbled answer costs something.
          </p>
          <p>
            PitchPerfect is somewhere to get those first attempts over with. You talk to a buyer who
            reacts to what you say, then read a scorecard that shows what worked, what didn&apos;t,
            and a better way to say it.
          </p>
          <p>
            When you&apos;re ready, the job board connects you with employers hiring for entry-level
            sales, and you decide whether they see your practice.
          </p>
        </div>
      </Section>

      <Section ground="soft" labelledBy="beliefs-heading">
        <SectionTitle id="beliefs-heading" size="title" className="max-w-[18ch]">
          What we hold to
        </SectionTitle>
        <StatementRows items={BELIEFS} className="mt-12 md:mt-16" />
      </Section>

      <Section
        labelledBy="project-heading"
        className="py-16 md:py-24"
        innerClassName="grid gap-y-6 lg:grid-cols-12 lg:items-baseline lg:gap-x-6"
      >
        <div className="max-w-[56ch] text-lede text-ink lg:col-span-7">
          <h2 id="project-heading" className="inline font-display font-bold text-navy">
            The project.
          </h2>{" "}
          <p className="inline">
            PitchPerfect is open source. The practice partner runs as its own service, stores
            nothing, and can&apos;t be reached from the internet. The main app holds your account
            and decides who can see what.
          </p>
        </div>
        <p className="max-w-[36ch] text-ink lg:col-span-4 lg:col-start-9">
          Questions, bug reports and security reports go to the maintainer listed on the
          project&apos;s GitHub page.
        </p>
      </Section>

      <CtaBand />
    </>
  );
}
