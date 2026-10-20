import { RUBRIC_DIMENSIONS } from "@pitchperfect/shared";
import {
  AudioLines,
  BookOpen,
  Briefcase,
  FileText,
  Lock,
  MessagesSquare,
  Quote,
} from "lucide-react";
import { CtaBand } from "@/components/marketing/CtaBand";
import { CtaLinks } from "@/components/marketing/CtaLinks";
import { FeatureGrid, type Feature } from "@/components/marketing/FeatureGrid";
import { skillFeatures } from "@/components/marketing/ForStudents";
import { Hero } from "@/components/marketing/Hero";
import { PracticeRoomPreview } from "@/components/marketing/PracticeRoomPreview";
import { Section, SectionHeading } from "@/components/marketing/Section";
import { pageMetadata, PUBLIC_PAGES } from "@/lib/seo";

export const metadata = pageMetadata(PUBLIC_PAGES.students);

const FEATURES: Feature[] = [
  {
    icon: BookOpen,
    title: "Short lessons",
    body: "Eight written lessons, one per skill, each with a framework, an example and the common mistakes.",
  },
  {
    icon: MessagesSquare,
    title: "A buyer who reacts",
    body: "The AI practice partner plays a named buyer with a personality and hidden objections, and responds to what you actually say.",
  },
  {
    icon: AudioLines,
    title: "Voice or text",
    body: "Hold to talk and edit the transcript before you send it, or type. Replies are spoken aloud and always captioned.",
  },
  {
    icon: Quote,
    title: "Feedback with evidence",
    body: "Each rubric score comes with a reason and a quote from your own turns, plus a stronger version of one of your lines.",
  },
  {
    icon: Briefcase,
    title: "Practice for the job",
    body: "Start a session from any job listing, and the scenario is built from that role's title, description and skills.",
  },
  {
    icon: FileText,
    title: "Apply with proof",
    body: "Apply with your résumé and, if you want, one scorecard. The employer sees the same scorecard you do.",
  },
];

const PRIVACY_POINTS = [
  "Your sessions are private unless you share a scorecard with an application.",
  "Transcripts are deleted automatically after 180 days, and you can delete any session sooner.",
  "PitchPerfect never receives or stores audio. Your browser turns speech into text.",
];

export default function StudentsPage() {
  return (
    <>
      <Hero
        compact
        eyebrow="For students"
        title="Rehearse the sales conversations that get you hired"
        lead={
          <p>
            Practice introductions, discovery, pitching and objections with an AI practice partner
            before you face a real buyer or a hiring manager.
          </p>
        }
        actions={<CtaLinks secondary={{ href: "/how-it-works", label: "See how it works" }} />}
      />

      <Section labelledBy="features-heading">
        <SectionHeading
          id="features-heading"
          title="Everything you need to walk in prepared"
          lead="Learn the idea, try it out loud, and see exactly what to change next time."
        />
        <FeatureGrid items={FEATURES} className="mt-10" />
      </Section>

      <Section tone="muted" labelledBy="room-heading">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              id="room-heading"
              title="A practice room that feels like a real call"
              lead="The conversation moves from opening to discovery, pitch, objection and close. You get up to 20 turns and 20 minutes, and you can end whenever you like."
            />
            <ul className="mt-8 flex flex-col gap-3">
              {PRIVACY_POINTS.map((point) => (
                <li key={point} className="flex gap-3 text-ink">
                  <Lock aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <PracticeRoomPreview />
        </div>
      </Section>

      <Section labelledBy="skills-heading">
        <SectionHeading
          id="skills-heading"
          title="Eight skills, each with its own scenario"
          lead="Every skill has a lesson and a practice scenario. The rubric dimension that matters most for the skill counts double in your score."
        />
        <FeatureGrid
          items={skillFeatures({ withWeight: true })}
          columns={4}
          dense
          className="mt-10"
        />
      </Section>

      <Section tone="muted" labelledBy="rubric-heading">
        <SectionHeading
          id="rubric-heading"
          title="The rubric, in plain words"
          lead="Each dimension is scored from 1 to 5. Here is what the ends of the scale mean."
        />
        <div className="mt-10 overflow-hidden rounded-card border border-border bg-surface shadow-card">
          <table className="w-full text-left text-small">
            <caption className="sr-only">Rubric dimensions and what a 1 and a 5 mean</caption>
            <thead className="bg-primary-soft text-ink">
              <tr>
                <th scope="col" className="px-4 py-3 font-bold md:px-6">
                  Dimension
                </th>
                <th scope="col" className="px-4 py-3 font-bold md:px-6">
                  A 1 sounds like
                </th>
                <th scope="col" className="px-4 py-3 font-bold md:px-6">
                  A 5 sounds like
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {RUBRIC_DIMENSIONS.map(({ key, name, low, high }) => (
                <tr key={key}>
                  <th scope="row" className="px-4 py-3 font-semibold text-navy md:px-6">
                    {name}
                  </th>
                  <td className="px-4 py-3 text-ink md:px-6">{low}</td>
                  <td className="px-4 py-3 text-ink md:px-6">{high}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <CtaBand tone="white" />
    </>
  );
}
