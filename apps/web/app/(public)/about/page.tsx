import { CtaBand } from "@/components/marketing/CtaBand";
import { Hero } from "@/components/marketing/Hero";
import { Section, SectionHeading } from "@/components/marketing/Section";
import { pageMetadata, PUBLIC_PAGES } from "@/lib/seo";

export const metadata = pageMetadata(PUBLIC_PAGES.about);

const BELIEFS = [
  {
    title: "Practice should be honest",
    body: "The practice partner is an AI, and it says so. It plays a believable buyer, but it never pretends to be a person.",
  },
  {
    title: "Feedback should be specific",
    body: "A score is only useful if you can see why. Every rubric score has a reason, and quotes are checked against what you said.",
  },
  {
    title: "Skills should be visible",
    body: "A résumé says where you studied. A shared scorecard shows how you handle a buyer. Candidates decide what employers see.",
  },
  {
    title: "Your data should stay yours",
    body: "Sessions are private by default, transcripts expire after 180 days, and deleting your account deletes your data.",
  },
];

export default function AboutPage() {
  return (
    <>
      <Hero
        compact
        eyebrow="About"
        title="About PitchPerfect"
        lead={
          <p>
            PitchPerfect helps people starting out in sales practice the conversations the job is
            made of, and helps employers find the people who have.
          </p>
        }
      />

      <Section labelledBy="why-heading">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
          <SectionHeading id="why-heading" title="Why it exists" />
          <div className="flex max-w-prose flex-col gap-4 text-ink md:text-h4 md:font-normal">
            <p>
              Sales is learned by doing, but the first real attempts usually happen in an interview
              or on a live call, where a fumbled answer costs something.
            </p>
            <p>
              PitchPerfect gives you somewhere to get those first attempts out of the way. You talk
              to a buyer who reacts to what you say, then read a scorecard that shows what worked,
              what didn't, and how to say it better.
            </p>
            <p>
              When you are ready, the job board connects you with employers hiring for entry-level
              sales roles, and you choose whether to share your practice.
            </p>
          </div>
        </div>
      </Section>

      <Section tone="muted" labelledBy="beliefs-heading">
        <SectionHeading id="beliefs-heading" title="What we believe" />
        <ul className="mt-10 grid gap-4 md:grid-cols-2">
          {BELIEFS.map(({ title, body }) => (
            <li
              key={title}
              className="rounded-card border border-border bg-surface p-6 shadow-card"
            >
              <h3 className="text-h4">{title}</h3>
              <p className="mt-2 text-ink">{body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section labelledBy="project-heading">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
          <SectionHeading id="project-heading" title="The project" />
          <div className="flex max-w-prose flex-col gap-4 text-ink">
            <p>
              PitchPerfect is an open-source project. The practice partner runs as its own service
              that never stores anything and is never reachable from the internet; the main
              application holds your account and decides what each person can see.
            </p>
            <p>
              Questions, bug reports and security reports go to the maintainer listed on the
              project's GitHub page.
            </p>
          </div>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
