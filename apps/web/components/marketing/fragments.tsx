import { getSkill, redactPii, RUBRIC_DIMENSIONS, type SkillSlug } from "@pitchperfect/shared";
import { seedCompanySlug } from "@pitchperfect/shared/seed-data";
import { ArrowDown, CalendarClock, FileText, Link2, Mic } from "lucide-react";
import { CompanyBadge } from "@/components/jobs/CompanyBadge";
import { formatPay } from "@/components/jobs/PayText";
import { PersonaCard } from "@/components/practice/PersonaCard";
import { RubricBar } from "@/components/practice/RubricBar";
import { Badge } from "@/components/ui/Badge";
import { PointerText } from "@/components/ui/PointerText";
import { placeLabel } from "@/lib/job-labels";
import {
  APPLIED_JOB,
  HIRING_JOB,
  PRACTICE_JOB,
  SAMPLE_LISTINGS,
  type SampleJob,
} from "./sample-jobs";
import { DISCOVERY_MOMENT, SAMPLE_SCORECARD, SAMPLE_SKILL_TITLE } from "./sample-session";

/*
 * Small pieces of the real product's screens, filled with fictional sample data, used as the
 * pictures on the public pages. Jobs and companies come from the seed data; people are invented.
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
      <PersonaCard persona={PITCH_BUYER} partner="sample" titleAs="p" />
      <div aria-hidden="true" className="flex items-center gap-3 rounded-card bg-surface-2 p-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-primary text-white">
          <Mic className="size-5" />
        </span>
        <span className="text-small text-ink">
          <PointerText fine="Hold Space to talk, or type" coarse="Hold the mic to talk, or type" />
        </span>
      </div>
    </div>
  );
}

/** A job's company with its badge, as a listing shows it. */
function CompanyLine({ job }: { job: SampleJob }) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-2 text-small text-ink">
      {job.company.name}
      <CompanyBadge verification={job.company.verification} domain={job.company.host} />
    </p>
  );
}

/** An application with one scorecard attached. */
export function ApplyFragment() {
  return (
    <div data-ui className="rounded-[20px] bg-surface p-5 ring-1 ring-border md:p-6">
      <p className="text-caption font-semibold text-muted">Apply</p>
      <p className="font-display text-lede font-semibold text-navy">{APPLIED_JOB.title}</p>
      <CompanyLine job={APPLIED_JOB} />
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

/** An employer's job post, as it looks once published. */
export function JobPostFragment() {
  return (
    <div data-ui className="rounded-[20px] bg-surface p-5 ring-1 ring-border md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-caption font-semibold text-muted">Job post</p>
          <p className="font-display text-lede font-semibold text-navy">{HIRING_JOB.title}</p>
        </div>
        <Badge tone="success">Published</Badge>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-small">
        <div className="rounded-control bg-surface-2 px-3 py-2">
          <dt className="text-ink">Pay</dt>
          <dd className="font-semibold text-ink">{formatPay(HIRING_JOB.pay)}</dd>
        </div>
        <div className="rounded-control bg-surface-2 px-3 py-2">
          <dt className="text-ink">Location</dt>
          <dd className="font-semibold text-ink">{placeLabel(HIRING_JOB)}</dd>
        </div>
      </dl>
      <ul aria-label="Skills" className="mt-3 flex flex-wrap gap-1.5">
        {HIRING_JOB.skills.map((name) => (
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
      <p className="text-small text-ink">{HIRING_JOB.title}</p>
      <ul className="mt-4 grid gap-2 text-small text-ink">
        <li className="flex items-center gap-2 rounded-control bg-surface-2 px-3 py-2">
          <CalendarClock aria-hidden="true" className="size-4 text-primary" />
          Friday, November 6, 10:30 am
        </li>
        <li className="flex items-center gap-2 rounded-control bg-surface-2 px-3 py-2">
          <Link2 aria-hidden="true" className="size-4 text-primary" />
          meet.example/{seedCompanySlug(HIRING_JOB.company)}-sdr
        </li>
      </ul>
      <p className="mt-3 text-small text-ink">Sent by email. It also shows in her applications.</p>
    </div>
  );
}

/** Two job listings as candidates see them: one verified company, one not yet. */
export function ListingsFragment() {
  return (
    <ul data-ui className="grid gap-3">
      {SAMPLE_LISTINGS.map((job) => (
        <li key={job.title} className="rounded-[20px] bg-surface p-5 ring-1 ring-border">
          <p className="font-display text-lede font-semibold text-navy">{job.title}</p>
          <CompanyLine job={job} />
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
      <p className="font-display text-lede font-semibold text-navy">{PRACTICE_JOB.title}</p>
      <p className="mt-1 text-small text-ink">
        {PRACTICE_JOB.company.name} · {placeLabel(PRACTICE_JOB)}
      </p>
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
  "I’ll send the one-pager tonight. Reach me at ",
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
