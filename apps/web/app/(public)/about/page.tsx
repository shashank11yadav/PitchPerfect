import { InView, InViewItem } from "@/components/motion/in-view";
import { CtaBand } from "@/components/marketing/CtaBand";
import { PageHero } from "@/components/marketing/Hero";
import { Section, SectionTitle, WRAP } from "@/components/marketing/Section";
import { COPY_LIMITS as L } from "@/content/limits";
import { cn } from "@/lib/cn";
import { pageMetadata, PUBLIC_PAGES } from "@/lib/seo";

export const metadata = pageMetadata(PUBLIC_PAGES.about);

const BELIEFS = [
  {
    title: "Honest practice",
    body: "The partner is an AI and says so. It plays a believable buyer, but it never pretends to be a person.",
  },
  {
    title: "Specific feedback",
    body: "A score is only useful if you can see why. Every rubric score has a reason, and quotes are checked against what you said.",
  },
  {
    title: "Visible skills",
    body: "A résumé says where you studied. A shared scorecard shows how you handle a buyer, and you decide who sees it.",
  },
  {
    title: "Your data stays yours",
    body: `Sessions are private by default, transcripts expire after ${L.retentionDays} days, and deleting your account deletes your data.`,
  },
] as const;

/** Grounds alternate, and every other field mirrors its layout. */
const FIELDS = [
  { ground: "pp-on-dark bg-navy", heading: "text-white", body: "text-white", mirrored: false },
  { ground: "bg-primary-soft", heading: "text-navy", body: "text-ink", mirrored: true },
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

      <section aria-labelledby="beliefs-heading">
        <h2 id="beliefs-heading" className="sr-only">
          What we believe
        </h2>
        <ul>
          {BELIEFS.map(({ title, body }, index) => {
            const field = FIELDS[index % 2] ?? FIELDS[0];
            return (
              <li key={title} className={field.ground}>
                <InView
                  className={cn(
                    WRAP,
                    "grid min-h-[44svh] content-between gap-y-12 py-16 md:min-h-[56svh] md:py-24 lg:grid-cols-12 lg:gap-x-6",
                  )}
                >
                  <InViewItem
                    className={cn(
                      "lg:col-span-4",
                      field.mirrored ? "lg:col-start-2" : "lg:col-start-8",
                    )}
                  >
                    <p className={cn("max-w-[36ch] text-lede", field.body)}>{body}</p>
                  </InViewItem>
                  <InViewItem
                    className={cn(
                      "lg:col-span-7 lg:row-start-2",
                      field.mirrored && "lg:col-start-6 lg:text-right",
                    )}
                  >
                    <h3 className={cn("text-title font-bold", field.heading)}>{title}</h3>
                  </InViewItem>
                </InView>
              </li>
            );
          })}
        </ul>
      </section>

      <Section
        labelledBy="project-heading"
        innerClassName="grid gap-y-8 lg:grid-cols-12 lg:gap-x-6"
      >
        <SectionTitle id="project-heading" size="title" className="lg:col-span-4">
          The project
        </SectionTitle>
        <div className="flex max-w-[60ch] flex-col gap-5 text-lede text-ink lg:col-span-7 lg:col-start-6">
          <p>
            PitchPerfect is open source. The practice partner runs as its own service, stores
            nothing, and can&apos;t be reached from the internet. The main app holds your account
            and decides who can see what.
          </p>
          <p>
            Questions, bug reports and security reports go to the maintainer listed on the
            project&apos;s GitHub page.
          </p>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
