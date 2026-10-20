import type { ApplicationStatus } from "@pitchperfect/shared";
import { Badge } from "@/components/ui/Badge";

type Tone = "neutral" | "info" | "success" | "danger";

/** What each status is called, the same for the student and the employer. */
export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: "Applied",
  shortlisted: "Shortlisted",
  interview: "Interview",
  hired: "Hired",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
  closed: "Closed",
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
export function StatusPill({ status }: { status: ApplicationStatus }) {
  return <Badge tone={TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}
