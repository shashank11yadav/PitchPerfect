import type { PublicJobSummary } from "@pitchperfect/shared";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { EMPLOYMENT_TYPE_LABELS, WORKPLACE_LABELS } from "@/lib/job-labels";
import { CompanyBadge } from "./CompanyBadge";
import { PayText } from "./PayText";

/** "Boston, MA (hybrid)", or just "Remote, US" when the location already says so. */
function where({ location, workplace }: PublicJobSummary): string {
  const label = WORKPLACE_LABELS[workplace];
  return location.toLowerCase().includes(label.toLowerCase())
    ? location
    : `${location} (${label.toLowerCase()})`;
}

interface JobCardProps {
  job: PublicJobSummary;
  /** Where the title links; the public job page by default. */
  href?: string;
  headingLevel?: "h2" | "h3";
  /** Smaller type and spacing for lists inside the app. */
  compact?: boolean;
}

/**
 * One row of a job list: the title (the whole row is the link), the company and its badge, then
 * pay, place and type at the far end.
 */
export function JobCard({
  job,
  href = `/jobs/${job.slug}`,
  headingLevel: Heading = "h3",
  compact = false,
}: JobCardProps) {
  return (
    <article
      className={cn(
        "group relative grid lg:grid-cols-12 lg:gap-x-6",
        compact ? "gap-y-3 py-6" : "gap-y-5 py-8 md:py-10",
      )}
    >
      <div className="lg:col-span-7">
        <Heading className={cn("text-navy", compact ? "text-h4 md:text-h3" : "text-h3 md:text-h2")}>
          <Link
            href={href}
            className="rounded-control decoration-[0.06em] underline-offset-[0.18em] group-hover:underline after:absolute after:inset-0"
          >
            {job.title}
          </Link>
        </Heading>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-ink">
          {job.company.name}
          <CompanyBadge verification={job.company.verification} />
        </p>
        {job.skills.length > 0 && (
          <p className="mt-2 text-small text-muted">
            <span className="sr-only">Skills: </span>
            {job.skills.join(", ")}
          </p>
        )}
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-1 lg:col-span-4 lg:col-start-9 lg:flex-col lg:flex-nowrap lg:pt-1.5">
        <dt className="sr-only">Pay</dt>
        <dd
          className={cn(
            "basis-full font-display font-semibold text-navy lg:basis-auto",
            compact ? "text-body" : "text-lede",
          )}
        >
          <PayText pay={job.pay} />
        </dd>
        <dt className="sr-only">Location</dt>
        <dd className="text-ink">{where(job)}</dd>
        <dt className="sr-only">Job type</dt>
        <dd className="text-ink">{EMPLOYMENT_TYPE_LABELS[job.employmentType]}</dd>
      </dl>
    </article>
  );
}
