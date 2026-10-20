import type { ApplicationStatus } from "@pitchperfect/shared";
import { Badge } from "@/components/ui/Badge";

type Tone = "neutral" | "info" | "success" | "danger";

/** What each status is called. The student's words; `EMPLOYER_STATUS_LABELS` differs in one. */
export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: "Applied",
  shortlisted: "Shortlisted",
  interview: "Interview",
  hired: "Hired",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
  closed: "Closed",
};

/** On the employer's side a rejection is their call, "Not a fit"; the student sees "Not selected". */
export const EMPLOYER_STATUS_LABELS: Record<ApplicationStatus, string> = {
  ...STATUS_LABELS,
  rejected: "Not a fit",
};

const TONES: Record<ApplicationStatus, Tone> = {
  applied: "neutral",
  shortlisted: "info",
  interview: "info",
  hired: "success",
  rejected: "danger",
  withdrawn: "neutral",
  closed: "neutral",
};

/** An application's status as a pill; the word carries the meaning, the colour only helps. */
export function StatusPill({
  status,
  viewer = "student",
}: {
  status: ApplicationStatus;
  /** Whose words to use: see `EMPLOYER_STATUS_LABELS`. */
  viewer?: "student" | "employer";
}) {
  const labels = viewer === "employer" ? EMPLOYER_STATUS_LABELS : STATUS_LABELS;
  return <Badge tone={TONES[status]}>{labels[status]}</Badge>;
}
