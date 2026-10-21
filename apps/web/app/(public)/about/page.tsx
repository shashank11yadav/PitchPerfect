import { CtaBand } from "@/components/marketing/CtaBand";
import { PageHero } from "@/components/marketing/Hero";
import { Section, SectionTitle } from "@/components/marketing/Section";
import { COPY_LIMITS as L } from "@/content/limits";
import { pageMetadata, PUBLIC_PAGES } from "@/lib/seo";

export const metadata = pageMetadata(PUBLIC_PAGES.about);

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
        {/* Running prose in two columns, read down then across, like a printed page. */}
        <div className="mt-10 flex flex-col gap-5 text-statement text-ink md:mt-14 lg:block lg:columns-2 lg:gap-x-16">
          <p className="break-inside-avoid lg:mb-5">
            The partner is software, and it says so. It plays a believable buyer, but it never
            claims to be a person, and if you ask what it is, it tells you.
          </p>
          <p className="break-inside-avoid lg:mb-5">
            A number on its own teaches you nothing. Every rubric line on a scorecard comes with the
            reason for it, and every quote is checked against what you actually said.
          </p>
          <p className="break-inside-avoid lg:mb-5">
            A résumé says where you studied. A shared scorecard shows how you handle a buyer, and
            you choose who sees it: employers only get one when you attach it to an application.
          </p>
          <p className="break-inside-avoid lg:mb-5">
            Transcripts expire after {L.retentionDays} days. Delete your account and your data goes
            with it.
          </p>
        </div>
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
