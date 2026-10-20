import { RUBRIC_DIMENSIONS } from "@pitchperfect/shared";
import { CtaBand } from "@/components/marketing/CtaBand";
import { CtaLinks } from "@/components/marketing/CtaLinks";
import { ApplyFragment, LessonFragment } from "@/components/marketing/fragments";
import { PageHero } from "@/components/marketing/Hero";
import { Section, SectionTitle } from "@/components/marketing/Section";
import { StageShowcase } from "@/components/marketing/SessionStages";
import { SkillsList } from "@/components/marketing/SkillsList";
import { StatementRows, type Statement } from "@/components/marketing/StatementRows";
import { COPY_LIMITS as L } from "@/content/limits";
import { pageMetadata, PUBLIC_PAGES } from "@/lib/seo";

export const metadata = pageMetadata(PUBLIC_PAGES.students);

const FEATURES: Statement[] = [
  {
    title: "Short lessons",
    body: "One for each skill, with a framework, a worked example and the mistakes people usually make.",
  },
  {
    title: "A buyer who pushes back",
    body: "The partner plays a named buyer with a personality and objections they hold back. It reacts to what you actually say.",
  },
  {
    title: "Talk or type",
    body: "Hold to talk and fix the transcript before you send it, or just type. Replies are read aloud and always captioned.",
  },
  {
    title: "Feedback you can check",
    body: "Every rubric score comes with a reason and a quote from your turns, plus a better way to say one of your lines.",
  },
  {
    title: "Practice for a real job",
    body: "Start from any job listing and the scenario is built from that role's title, description and skills.",
  },
  {
    title: "Apply with proof",
    body: "Send your résumé and, if you like, one scorecard. The employer sees the same scorecard you do.",
  },
];

export default function StudentsPage() {
  return (
    <>
      <PageHero
        title="Practice the calls interviews test"
        lead={
          <p>
            Sales interviews ask you to introduce yourself, find the problem, pitch and handle
            pushback. Rehearse each one with an AI buyer, then read exactly what to change.
          </p>
        }
        actions={<CtaLinks secondary={{ href: "/how-it-works", label: "See how it works" }} />}
      />

      <StageShowcase title="A call that moves like a real one">
        <p>
          The call goes from opening to discovery, pitch, objection and close. You get {L.turns}{" "}
          turns and {L.minutes} minutes, and you can stop whenever you want.
        </p>
        <p>
          Your sessions stay private unless you share a scorecard with an application. Transcripts
          are deleted after {L.retentionDays} days, and you can delete any session sooner.
        </p>
        <p>PitchPerfect never gets your audio. Your browser turns speech into text.</p>
      </StageShowcase>

      <Section ground="soft" labelledBy="features-heading">
        <div className="grid items-start gap-y-12 lg:grid-cols-12 lg:gap-x-6">
          <div className="lg:sticky lg:top-28 lg:col-span-5">
            <SectionTitle id="features-heading" size="title">
              What you get
            </SectionTitle>
            <div className="mt-10 grid max-w-md gap-4">
              <LessonFragment />
              <ApplyFragment />
            </div>
          </div>
          <StatementRows
            items={FEATURES}
            layout="pinned"
            className="lg:col-span-6 lg:col-start-7"
          />
        </div>
      </Section>

      <SkillsList />

      <Section ground="soft" labelledBy="rubric-heading">
        <div className="grid gap-y-6 lg:grid-cols-12 lg:items-end lg:gap-x-6">
          <SectionTitle id="rubric-heading" size="title" className="max-w-[12ch] lg:col-span-7">
            The rubric, in plain words
          </SectionTitle>
          <p className="max-w-[40ch] text-lede text-ink lg:col-span-4 lg:col-start-9">
            Each line is scored from 1 to 5. Here is what each end of the scale sounds like.
          </p>
        </div>
        {/* Phones get the same rubric as a list; the three-column table needs the width. */}
        <ul className="mt-14 flex flex-col gap-3 md:hidden">
          {RUBRIC_DIMENSIONS.map(({ key, name, low, high }) => (
            <li key={key} className="rounded-[20px] bg-surface p-5">
              <h3 className="font-display text-lede font-semibold text-navy">{name}</h3>
              <dl className="mt-2 grid gap-2 text-ink">
                <div>
                  <dt className="text-small font-semibold">A 1 sounds like</dt>
                  <dd>{low}</dd>
                </div>
                <div>
                  <dt className="text-small font-semibold">A 5 sounds like</dt>
                  <dd>{high}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
        <div className="mt-20 hidden overflow-hidden rounded-[20px] bg-surface md:block">
          <table className="w-full text-left">
            <caption className="sr-only">Rubric lines and what a 1 and a 5 sound like</caption>
            <thead className="text-small text-ink">
              <tr>
                <th scope="col" className="px-4 pt-6 pb-3 font-bold md:px-8">
                  Line
                </th>
                <th scope="col" className="px-4 pt-6 pb-3 font-bold md:px-8">
                  A 1 sounds like
                </th>
                <th scope="col" className="px-4 pt-6 pb-3 font-bold md:px-8">
                  A 5 sounds like
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {RUBRIC_DIMENSIONS.map(({ key, name, low, high }) => (
                <tr key={key} className="align-baseline">
                  <th
                    scope="row"
                    className="px-4 py-4 font-display text-lede font-semibold text-navy md:px-8"
                  >
                    {name}
                  </th>
                  <td className="px-4 py-4 text-ink md:px-8">{low}</td>
                  <td className="px-4 py-4 text-ink md:px-8">{high}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
