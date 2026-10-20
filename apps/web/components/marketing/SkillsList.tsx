import { RUBRIC_DIMENSIONS, SKILLS } from "@pitchperfect/shared";
import Link from "next/link";
import { InView, InViewItem } from "@/components/motion/in-view";
import { Section, SectionTitle } from "./Section";

const dimensionName = (key: string) =>
  RUBRIC_DIMENSIONS.find((dimension) => dimension.key === key)?.name ?? key;

interface SkillsListProps {
  ground?: "white" | "soft";
  /** Where "See the rubric" points; left out on the page that holds the rubric. */
  rubricHref?: string;
}

/** The eight skills as a compact two-column list, each with the rubric line that counts double. */
export function SkillsList({ ground = "white", rubricHref }: SkillsListProps) {
  return (
    <Section ground={ground} labelledBy="skills-heading">
      <div className="max-w-2xl">
        <SectionTitle id="skills-heading">Eight skills, each with its own buyer</SectionTitle>
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
