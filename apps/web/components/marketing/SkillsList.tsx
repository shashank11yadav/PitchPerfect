import { RUBRIC_DIMENSIONS, SKILLS } from "@pitchperfect/shared";
import Link from "next/link";
import { InView, InViewItem } from "@/components/motion/in-view";
import { cn } from "@/lib/cn";
import { PracticeFragment } from "./fragments";
import { Section, SectionTitle } from "./Section";

const dimensionName = (key: string) =>
  RUBRIC_DIMENSIONS.find((dimension) => dimension.key === key)?.name ?? key;

interface SkillsListProps {
  ground?: "white" | "soft";
  /** Where "See the rubric" points; left out on the page that holds the rubric. */
  rubricHref?: string;
}

/** The eight skills as a list set to the right, with the line that counts double for each. */
export function SkillsList({ ground = "white", rubricHref }: SkillsListProps) {
  return (
    <Section ground={ground} labelledBy="skills-heading">
      <SectionTitle id="skills-heading" size="title" className="max-w-[16ch]">
        Eight skills, each with its own buyer
      </SectionTitle>
      <div className="mt-14 grid gap-y-10 md:mt-20 lg:grid-cols-12 lg:gap-x-6">
        <div className="lg:col-span-3">
          <p className="max-w-[34ch] text-ink">
            Every skill has a lesson and a practice scenario. The rubric line that matters most for
            the skill counts double in your score.
          </p>
          {rubricHref && (
            <Link
              href={rubricHref}
              className="pp-link mt-4 inline-block font-semibold text-primary"
            >
              See the rubric
            </Link>
          )}
          <div className="mt-10 max-w-sm">
            <PracticeFragment />
          </div>
        </div>
        <InView as="ul" className="lg:col-span-8 lg:col-start-5">
          {SKILLS.map((skill, index) => (
            <InViewItem
              key={skill.slug}
              as="li"
              className={cn(
                "grid gap-x-6 gap-y-1 py-4 md:grid-cols-[13rem_1fr_auto] md:items-baseline",
                index === 4 && "mt-8",
              )}
            >
              <h3 className="font-display text-lede font-semibold text-navy">{skill.title}</h3>
              <p className="text-ink">{skill.summary}</p>
              <p className="text-small text-ink md:text-right">
                Counts double: {dimensionName(skill.weighted)}
              </p>
            </InViewItem>
          ))}
        </InView>
      </div>
    </Section>
  );
}
