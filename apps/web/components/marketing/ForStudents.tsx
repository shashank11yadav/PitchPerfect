import { RUBRIC_DIMENSIONS, SKILLS, type SkillSlug } from "@pitchperfect/shared";
import {
  ArrowRight,
  CalendarCheck,
  Check,
  Hand,
  Handshake,
  Presentation,
  Search,
  ShieldCheck,
  Smile,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { FeatureGrid, type Feature } from "./FeatureGrid";
import { Section, SectionHeading } from "./Section";

const SKILL_ICONS: Record<SkillSlug, LucideIcon> = {
  "introducing-yourself": Hand,
  pitching: Presentation,
  "objection-handling": ShieldCheck,
  "probing-discovery": Search,
  "referrals-networking": Users,
  "next-steps": CalendarCheck,
  "asking-for-the-business": Handshake,
  "interpersonal-skills": Smile,
};

const dimensionName = (key: string) =>
  RUBRIC_DIMENSIONS.find((dimension) => dimension.key === key)?.name ?? key;

/** The eight practice skills as cards; `withWeight` adds the dimension that counts double. */
export function skillFeatures({ withWeight = false } = {}): Feature[] {
  return SKILLS.map((skill) => ({
    icon: SKILL_ICONS[skill.slug],
    title: skill.title,
    body: skill.summary,
    ...(withWeight && { meta: `Counts double: ${dimensionName(skill.weighted)}` }),
  }));
}

const POINTS = [
  "Practice out loud or by typing, with captions always on",
  "A buyer with a real personality and objections they keep to themselves",
  "A scorecard on seven dimensions, with quotes from what you said",
  "Practice for a specific job before you apply to it",
];

/** Home page section for students: what they get, plus the eight skills. */
export function ForStudents() {
  return (
    <Section tone="muted" labelledBy="for-students-heading">
      <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
        <div className="lg:sticky lg:top-28">
          <SectionHeading
            id="for-students-heading"
            eyebrow="For students"
            title="Get good at the conversations interviews test"
            lead="Sales interviews ask you to pitch, handle pushback and close. PitchPerfect lets you rehearse each of those with a buyer who reacts to what you say."
          />
          <ul className="mt-8 flex flex-col gap-3">
            {POINTS.map((point) => (
              <li key={point} className="flex gap-3 text-ink">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-pill bg-success/15 text-success">
                  <Check aria-hidden="true" className="size-4" />
                </span>
                {point}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup/student" className={buttonClasses({ size: "lg" })}>
              Start practicing
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <Link href="/students" className={buttonClasses({ variant: "secondary", size: "lg" })}>
              More for students
            </Link>
          </div>
        </div>
        <div>
          <h3 className="text-h4">Eight skills to practice</h3>
          <FeatureGrid items={skillFeatures()} columns={2} dense className="mt-4" />
        </div>
      </div>
    </Section>
  );
}
