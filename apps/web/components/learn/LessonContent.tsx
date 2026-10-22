import { RUBRIC_DIMENSIONS, SKILLS, getSkill, type SkillSlug } from "@pitchperfect/shared";
import { ArrowLeft, ArrowRight, Mic } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { lessonPath, practiceHref } from "@/lib/practice/paths";
import { LessonProgress } from "./LessonProgress";

const TEXT_LINK =
  "pp-link inline-flex items-center gap-1.5 rounded-control font-semibold text-primary";

interface LessonContentProps {
  skill: SkillSlug;
  /** The lesson's MDX. */
  children: ReactNode;
}

/**
 * One lesson: its title from `SKILLS`, the written lesson, the done toggle and the way into
 * practice, with what the practice partner's scorecard weighs for this skill alongside.
 */
export function LessonContent({ skill, children }: LessonContentProps) {
  const { title, summary, weighted } = getSkill(skill);
  const dimension = RUBRIC_DIMENSIONS.find(({ key }) => key === weighted);
  const index = SKILLS.findIndex(({ slug }) => slug === skill);
  const next = SKILLS[index + 1];

  return (
    <article
      aria-labelledby="lesson-title"
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start xl:gap-8"
    >
      <Card className="md:p-10">
        <Link href={lessonPath()} className={`${TEXT_LINK} text-small`}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          All lessons
        </Link>
        <h2 id="lesson-title" className="mt-6 text-h3 md:text-h2">
          {title}
        </h2>
        <p className="mt-2 max-w-prose text-lede text-muted">{summary}</p>
        <div className="mt-8 max-w-prose border-t border-border pt-8 text-ink">{children}</div>
        <div className="mt-10 flex max-w-prose flex-col gap-6 border-t border-border pt-8 sm:flex-row sm:items-start sm:justify-between">
          <LessonProgress skill={skill} />
          <Link href={practiceHref(skill)} className={buttonClasses({ size: "lg" })}>
            <Mic aria-hidden="true" className="size-5" />
            Practice this skill
          </Link>
        </div>
      </Card>

      <aside aria-labelledby="lesson-scoring" className="flex flex-col gap-6">
        {dimension && (
          <Card className="bg-primary-soft shadow-none">
            <h2 id="lesson-scoring" className="font-sans text-small font-bold text-navy">
              How practice scores this skill
            </h2>
            <p className="mt-2 text-ink">
              <span className="font-semibold">{dimension.name}</span> counts double on this
              scorecard.
            </p>
            <dl className="mt-4 flex flex-col gap-3 text-small">
              <div>
                <dt className="font-semibold text-ink">A 5 sounds like</dt>
                <dd className="text-ink">{dimension.high}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">A 1 sounds like</dt>
                <dd className="text-ink">{dimension.low}</dd>
              </div>
            </dl>
          </Card>
        )}
        {next && (
          <Link href={lessonPath(next.slug)} className={TEXT_LINK}>
            Next lesson: {next.title}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        )}
      </aside>
    </article>
  );
}
