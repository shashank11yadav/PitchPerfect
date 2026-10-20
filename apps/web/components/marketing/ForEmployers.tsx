import { ArrowRight, BadgeCheck, CalendarClock, ClipboardList, Eye } from "lucide-react";
import Link from "next/link";
import { ScoreRing } from "@/components/practice/ScoreRing";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Section, SectionHeading } from "./Section";

/** Fictional applicants for the sample pipeline. */
const APPLICANTS = [
  {
    name: "Jordan Ellis",
    detail: "Communication · Class of 2026",
    score: 84,
    status: "Shortlisted",
  },
  { name: "Priya Raman", detail: "Business · Class of 2025", score: 66, status: "Interview" },
  { name: "Sam Okafor", detail: "Marketing · Class of 2026", score: null, status: "Applied" },
] as const;

/** A static applicant list in the employer view, with sample data. */
export function ApplicantsPreview() {
  return (
    <figure className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
        <span>
          <span className="block text-caption font-semibold text-muted">Sample applicants</span>
          <span className="block font-display font-semibold text-navy">
            Sales development representative
          </span>
        </span>
        <Badge tone="success">
          <BadgeCheck aria-hidden="true" className="size-3.5" />
          Verified company
        </Badge>
      </figcaption>
      <ul className="divide-y divide-border">
        {APPLICANTS.map(({ name, detail, score, status }) => (
          <li key={name} className="flex items-center gap-3 px-5 py-4">
            {score === null ? (
              <span className="flex size-14 shrink-0 items-center justify-center rounded-pill border-2 border-dashed border-border text-caption font-semibold text-muted">
                <span className="sr-only">No scorecard shared</span>
                <span aria-hidden="true">—</span>
              </span>
            ) : (
              <ScoreRing score={score} size="sm" className="shrink-0" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-ink">{name}</span>
              <span className="block truncate text-small text-muted">{detail}</span>
            </span>
            <Badge tone={status === "Applied" ? "neutral" : "info"}>{status}</Badge>
          </li>
        ))}
      </ul>
    </figure>
  );
}

const POINTS = [
  {
    icon: Eye,
    text: "See the scorecard a candidate chose to share, with the quotes behind every score",
  },
  { icon: ClipboardList, text: "Move applicants from applied to shortlisted, interview and hired" },
  {
    icon: CalendarClock,
    text: "Schedule interviews with a time and a meeting link, sent by email",
  },
  { icon: BadgeCheck, text: "Get a verified badge when your work email matches your website" },
];

/** Home page section for employers. */
export function ForEmployers() {
  return (
    <Section labelledBy="for-employers-heading">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="lg:order-2">
          <SectionHeading
            id="for-employers-heading"
            eyebrow="For employers"
            title="Hire people who have already practiced the job"
            lead="Post entry-level sales roles and see how applicants handle a buyer before the first interview."
          />
          <ul className="mt-8 flex flex-col gap-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3 text-ink">
                <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                {text}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup/employer" className={buttonClasses({ size: "lg" })}>
              Post a job
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <Link href="/employers" className={buttonClasses({ variant: "secondary", size: "lg" })}>
              More for employers
            </Link>
          </div>
        </div>
        <ApplicantsPreview />
      </div>
    </Section>
  );
}
