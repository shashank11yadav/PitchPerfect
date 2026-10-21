import { getSkill, redactPii, RUBRIC_DIMENSIONS, type SkillSlug } from "@pitchperfect/shared";
import { ArrowDown, CalendarClock, FileText, Link2, Mic } from "lucide-react";
import { CompanyBadge } from "@/components/jobs/CompanyBadge";
import { PersonaCard } from "@/components/practice/PersonaCard";
import { RubricBar } from "@/components/practice/RubricBar";
import { Badge } from "@/components/ui/Badge";
import { DISCOVERY_MOMENT, SAMPLE_SCORECARD, SAMPLE_SKILL_TITLE } from "./sample-session";

/*
 * Small pieces of the real product's screens, filled with fictional sample data, used as the
 * pictures on the public pages. Companies come from the seed list; people are invented.
 */

/** A lesson's opening card: the skill, its summary, and the two ends of its rubric line. */
export function LessonFragment({ slug = "objection-handling" }: { slug?: SkillSlug }) {
  const skill = getSkill(slug);
  const rubric = RUBRIC_DIMENSIONS.find((dimension) => dimension.key === skill.weighted);
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

const PITCH_BUYER = {
  personaName: "Tom Reyes",
  personaTitle: "Head of facilities",
  companyType: "Hospital group with four sites",
  personality: "Polite, skeptical, short on time",
};

/** The start of a pitching call: who you're about to talk to, and the control you talk with. */
export function PracticeFragment() {
  return (
    <div data-ui className="flex flex-col gap-3 rounded-[20px] bg-surface p-4 ring-1 ring-border">
      <p className="px-1 text-caption font-semibold text-muted">Pitching: your buyer</p>
      <PersonaCard persona={PITCH_BUYER} titleAs="p" />
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
        <CompanyBadge verification="verified" />
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
      <p className="font-display text-lede font-semibold text-navy">Hannah Lee</p>
      <p className="text-small text-ink">Sales development representative</p>
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
    title: "Sales development representative",
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
            <CompanyBadge verification={verified ? "verified" : "unverified"} />
          </p>
        </li>
      ))}
    </ul>
  );
}

const lastQuestion = DISCOVERY_MOMENT.transcript.findLast((line) => line.role === "student");

/** The scorecard's "stronger version" for the discovery call on the students page. */
export function StrongerLineFragment() {
  return (
    <div data-ui className="rounded-[20px] bg-surface p-5 ring-1 ring-border md:p-6">
      <p className="text-caption font-semibold text-muted">Stronger version</p>
      <p className="mt-2 text-small font-semibold text-ink">You said</p>
      <p className="text-ink">{lastQuestion?.text}</p>
      <ArrowDown aria-hidden="true" className="my-2 size-4 text-primary" />
      <p className="text-small font-semibold text-primary">Try</p>
      <p className="font-semibold text-ink">
        How often does that happen, and what does a pushed-back afternoon cost you in overtime or
        lost jobs?
      </p>
    </div>
  );
}

/** A job listing with its "Practice for this job" action. */
export function JobPracticeFragment() {
  return (
    <div data-ui className="rounded-[20px] bg-surface p-5 ring-1 ring-border md:p-6">
      <p className="text-caption font-semibold text-muted">Job</p>
      <p className="font-display text-lede font-semibold text-navy">Inside sales associate</p>
      <p className="mt-1 text-small text-ink">Lumivale Learning Systems, remote</p>
      <span className="mt-4 inline-flex h-10 items-center rounded-pill bg-primary px-4 text-small font-semibold text-white">
        Practice for this job
      </span>
      <p className="mt-3 text-small text-ink">
        The buyer and their objections are built from this listing.
      </p>
    </div>
  );
}

/** A seller's turn with contact details in it; the email and number must never break. */
const TYPED_PARTS = [
  "I'll send the one-pager tonight. Reach me at ",
  { keep: "dana.k@example.test" },
  " or ",
  { keep: "617-555-0142" },
  ".",
] as const;

const typed = TYPED_PARTS.map((part) => (typeof part === "string" ? part : part.keep)).join("");

/** A practice turn before and after contact details are stripped, using the real redaction. */
export function RedactionFragment() {
  return (
    <div data-ui className="rounded-[20px] bg-surface p-5 text-ink md:p-6">
      <p className="text-caption font-semibold text-muted">Your turn, as a seller</p>
      <p className="mt-3 text-small font-semibold">What you typed</p>
      <p data-testid="typed-turn">
        {TYPED_PARTS.map((part) =>
          typeof part === "string" ? (
            part
          ) : (
            <span key={part.keep} className="whitespace-nowrap">
              {part.keep}
            </span>
          ),
        )}
      </p>
      <p className="mt-3 text-small font-semibold">What is stored and sent</p>
      <p data-testid="stored-turn" className="rounded-control bg-primary-soft px-3 py-2">
        {redactPii(typed)}
      </p>
    </div>
  );
}

const firstQuestion = DISCOVERY_MOMENT.transcript.find((line) => line.role === "student");
const QUOTE = "what happens to the rest of their day?";

/** One scored rubric line from Daniel's discovery call, the way the scorecard shows it. */
export function ScoredLineFragment() {
  return (
    <div data-ui className="rounded-[20px] bg-surface p-5 ring-1 ring-border md:p-6">
      <p className="mb-3 text-caption font-semibold text-muted">
        From a scorecard: {DISCOVERY_MOMENT.skillTitle}
      </p>
      <RubricBar
        name="Discovery questions"
        score={4}
        weighted
        headingLevel="h3"
        justification="Opened by asking what a long job does to the rest of the day, then asked how often it happens."
        evidence={firstQuestion?.text.includes(QUOTE) ? QUOTE : null}
      />
    </div>
  );
}
