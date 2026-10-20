import { BadgeCheck } from "lucide-react";
import { ScoreRing } from "@/components/practice/ScoreRing";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

interface Applicant {
  name: string;
  detail: string;
  /** The shared scorecard's overall score, or null when none was shared. */
  score: number | null;
  status: "Applied" | "Shortlisted" | "Interview";
}

interface Pipeline {
  job: string;
  applicants: readonly Applicant[];
}

/** Fictional applicants for an SDR role, on the home page. */
const SDR_PIPELINE: Pipeline = {
  job: "Sales development representative",
  applicants: [
    {
      name: "Jordan Ellis",
      detail: "Communication, class of 2026",
      score: 84,
      status: "Shortlisted",
    },
    { name: "Priya Raman", detail: "Business, class of 2025", score: 66, status: "Interview" },
    { name: "Sam Okafor", detail: "Marketing, class of 2026", score: null, status: "Applied" },
  ],
};

/** Fictional applicants for an account executive role, on the employers page. */
export const AE_PIPELINE: Pipeline = {
  job: "Account executive",
  applicants: [
    { name: "Hannah Lee", detail: "Economics, class of 2025", score: 91, status: "Interview" },
    { name: "Marcus Webb", detail: "Psychology, class of 2026", score: 72, status: "Shortlisted" },
    { name: "Ines Duarte", detail: "Communication, class of 2026", score: 58, status: "Applied" },
    { name: "Theo Grant", detail: "Business, class of 2025", score: null, status: "Applied" },
  ],
};

/** A static applicant list in the employer view, with sample data. */
export function ApplicantsPreview({
  pipeline = SDR_PIPELINE,
  floating = false,
}: {
  pipeline?: Pipeline;
  floating?: boolean;
}) {
  return (
    <figure
      data-ui
      className={cn(
        "overflow-hidden rounded-[20px] bg-surface text-ink",
        floating ? "shadow-float" : "ring-1 ring-border",
      )}
    >
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
        <span>
          <span className="block text-caption font-semibold text-muted">Sample applicants</span>
          <span className="block font-display font-semibold text-navy">{pipeline.job}</span>
        </span>
        <Badge tone="success">
          <BadgeCheck aria-hidden="true" className="size-3.5" />
          Verified company
        </Badge>
      </figcaption>
      <ul className="divide-y divide-border">
        {pipeline.applicants.map(({ name, detail, score, status }) => (
          <li key={name} className="flex items-center gap-3 px-5 py-4">
            {score === null ? (
              <span className="flex size-14 shrink-0 items-center justify-center rounded-pill bg-surface-2 text-caption font-semibold text-ink">
                <span className="sr-only">No scorecard shared</span>
                <span aria-hidden="true">None</span>
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
