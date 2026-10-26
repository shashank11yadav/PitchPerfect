import { RUBRIC_DIMENSIONS, SKILLS } from "@pitchperfect/shared";
import Link from "next/link";
import { InView, InViewItem } from "@/components/motion/in-view";
import { Section, SectionTitle, WRAP } from "./Section";

/** One to twelve, as words. */
const COUNT_WORDS = [
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
];

/** The number of skills as a word ("Eight"), or digits past twelve. */
const skillCount = COUNT_WORDS[SKILLS.length - 1] ?? String(SKILLS.length);

const dimensionName = (key: string) =>
  RUBRIC_DIMENSIONS.find((dimension) => dimension.key === key)?.name ?? key;

interface SkillsListProps {
  ground?: "white" | "soft";
  /** Where "See the rubric" points; left out on the page that holds the rubric. */
  rubricHref?: string;
}

/** The skills as a compact two-column list, each with the rubric line that counts double. */
export function SkillsList({ ground = "white", rubricHref }: SkillsListProps) {
  return (
    <Section ground={ground} labelledBy="skills-heading">
      <div className="max-w-2xl">
        <SectionTitle id="skills-heading">
          {skillCount} skills, each with its own buyer
        </SectionTitle>
        <p className="mt-4 text-lede text-ink">
          Every skill has a lesson and a practice call. The rubric line that matters most for the
          skill counts double in your score.{" "}
          {rubricHref && (
            <Link href={rubricHref} className="pp-link font-semibold text-primary">
              See the rubric
            </Link>
          )}
        </p>
      </div>
      <InView as="ul" className="mt-12 grid gap-x-6 gap-y-8 md:mt-16 md:grid-cols-2 lg:gap-x-16">
        {SKILLS.map((skill) => (
          <InViewItem key={skill.slug} as="li" className="max-w-xl">
            <h3 className="font-display text-lede font-semibold text-navy">{skill.title}</h3>
            <p className="mt-1 text-ink">{skill.summary}</p>
            <p className="mt-1 text-small text-ink">
              Counts double: {dimensionName(skill.weighted)}
            </p>
          </InViewItem>
        ))}
      </InView>
    </Section>
  );
}

/**
 * Home: the skills as short cards, a name and a line each, pointing to the full list on the
 * students page.
 */
export function SkillCards() {
  return (
    <section aria-labelledby="skill-cards-heading" className="bg-surface py-16 md:py-24">
      <div className={WRAP}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
          <SectionTitle id="skill-cards-heading">{skillCount} skills to practice</SectionTitle>
          <Link href="/students#skills-heading" className="pp-link font-semibold text-primary">
            What each one covers
          </Link>
        </div>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 md:mt-12 lg:grid-cols-4 lg:gap-4">
          {SKILLS.map((skill) => (
            <li key={skill.slug} className="rounded-card bg-primary-soft p-4 md:p-5">
              <h3 className="font-display text-lede font-semibold text-navy">{skill.title}</h3>
              <p className="mt-1 text-small text-ink">{skill.summary}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
