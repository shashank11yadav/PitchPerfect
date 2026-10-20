import { getSkill, RUBRIC_DIMENSIONS } from "@pitchperfect/shared";
import { BadgeCheck, CalendarClock, CircleAlert, FileText, Link2, Mic } from "lucide-react";
import { PersonaCard } from "@/components/practice/PersonaCard";
import { Badge } from "@/components/ui/Badge";
import { SAMPLE_PERSONA, SAMPLE_SCORECARD, SAMPLE_SKILL_TITLE } from "./sample-session";

/*
 * Small pieces of the real product's screens, filled with fictional sample data, used as the
 * pictures on the public pages. Companies come from the seed list; people are invented.
 */

const skill = getSkill("objection-handling");
const rubric = RUBRIC_DIMENSIONS.find((dimension) => dimension.key === skill.weighted);

/** A lesson's opening card: the skill, its summary, and the two ends of its rubric line. */
export function LessonFragment() {
  return (
    <div data-ui className="rounded-[20px] bg-surface p-5 ring-1 ring-border md:p-6">
      <p className="text-caption font-semibold text-muted">Lesson</p>
      <p className="font-display text-lede font-semibold text-navy">{skill.title}</p>
      <p className="mt-1 text-small text-ink">{skill.summary}</p>
      {rubric && (
        <dl className="mt-4 grid gap-2 text-small">
          <div className="rounded-control bg-surface-2 px-3 py-2">
            <dt className="font-semibold text-ink">A 1 sounds like</dt>
            <dd className="text-ink">{rubric.low}</dd>
          </div>
          <div className="rounded-control bg-primary-soft px-3 py-2">
            <dt className="font-semibold text-ink">A 5 sounds like</dt>
            <dd className="text-ink">{rubric.high}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

/** Who you're talking to, and the control you talk with. */
export function PracticeFragment() {
  return (
    <div data-ui className="flex flex-col gap-3 rounded-[20px] bg-surface p-4 ring-1 ring-border">
      <PersonaCard persona={SAMPLE_PERSONA} titleAs="p" />
      <div aria-hidden="true" className="flex items-center gap-3 rounded-card bg-surface-2 p-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-primary text-white">
          <Mic className="size-5" />
        </span>
        <span className="text-small text-ink">Hold Space to talk, or type</span>
      </div>
    </div>
  );
}

/** An application with one scorecard attached. */
export function ApplyFragment() {
  return (
    <div data-ui className="rounded-[20px] bg-surface p-5 ring-1 ring-border md:p-6">
      <p className="text-caption font-semibold text-muted">Apply</p>
      <p className="font-display text-lede font-semibold text-navy">
        Sales development representative
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-small text-ink">
        Quarrow Logistics Software
        <Badge tone="success">
          <BadgeCheck aria-hidden="true" className="size-3.5" />
          Verified company
        </Badge>
      </p>
      <ul className="mt-4 grid gap-2 text-small text-ink">
        <li className="flex items-center gap-2 rounded-control bg-surface-2 px-3 py-2">
          <FileText aria-hidden="true" className="size-4 text-primary" />
          Résumé attached
        </li>
        <li className="flex items-center justify-between gap-2 rounded-control bg-primary-soft px-3 py-2">
          <span>Scorecard shared: {SAMPLE_SKILL_TITLE}</span>
          <span className="font-bold text-navy tabular-nums">{SAMPLE_SCORECARD.overall}</span>
        </li>
      </ul>
    </div>
  );
}

const JOB_SKILLS = ["Prospecting", "Discovery calls", "Objection handling"];

/** An employer's job post, as it looks once published. */
export function JobPostFragment() {
  return (
    <div data-ui className="rounded-[20px] bg-surface p-5 ring-1 ring-border md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-caption font-semibold text-muted">Job post</p>
          <p className="font-display text-lede font-semibold text-navy">
            Sales development representative
          </p>
        </div>
        <Badge tone="success">Published</Badge>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-small">
        <div className="rounded-control bg-surface-2 px-3 py-2">
          <dt className="text-ink">Pay</dt>
          <dd className="font-semibold text-ink">$52,000 to $60,000 a year</dd>
        </div>
        <div className="rounded-control bg-surface-2 px-3 py-2">
          <dt className="text-ink">Workplace</dt>
          <dd className="font-semibold text-ink">Hybrid, Denver</dd>
        </div>
      </dl>
      <ul aria-label="Skills" className="mt-3 flex flex-wrap gap-1.5">
        {JOB_SKILLS.map((name) => (
          <li
            key={name}
            className="rounded-pill bg-primary-soft px-2.5 py-0.5 text-caption font-semibold text-ink"
          >
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The interview invite an employer sends, with its time and meeting link. */
export function InviteFragment() {
  return (
    <div data-ui className="rounded-[20px] bg-surface p-5 ring-1 ring-border md:p-6">
      <p className="text-caption font-semibold text-muted">Interview invite</p>
      <p className="font-display text-lede font-semibold text-navy">Priya Raman</p>
      <ul className="mt-4 grid gap-2 text-small text-ink">
        <li className="flex items-center gap-2 rounded-control bg-surface-2 px-3 py-2">
          <CalendarClock aria-hidden="true" className="size-4 text-primary" />
          Friday, November 6, 10:30 am
        </li>
        <li className="flex items-center gap-2 rounded-control bg-surface-2 px-3 py-2">
          <Link2 aria-hidden="true" className="size-4 text-primary" />
          meet.example/quarrow-sdr
        </li>
      </ul>
      <p className="mt-3 text-small text-ink">Sent by email. It also shows in her applications.</p>
    </div>
  );
}

const LISTINGS = [
  {
    title: "Account executive",
    company: "Quarrow Logistics Software",
    verified: true,
  },
  { title: "Inside sales associate", company: "Orvexa Payments", verified: false },
] as const;

/** Two job listings as candidates see them: one verified company, one not yet. */
export function ListingsFragment() {
  return (
    <ul data-ui className="grid gap-3">
      {LISTINGS.map(({ title, company, verified }) => (
        <li key={title} className="rounded-[20px] bg-surface p-5 ring-1 ring-border">
          <p className="font-display text-lede font-semibold text-navy">{title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-small text-ink">
            {company}
            {verified ? (
              <Badge tone="success">
                <BadgeCheck aria-hidden="true" className="size-3.5" />
                Verified company
              </Badge>
            ) : (
              <Badge tone="warning">
                <CircleAlert aria-hidden="true" className="size-3.5" />
                Unverified employer
              </Badge>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}
