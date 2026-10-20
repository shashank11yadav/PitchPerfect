import type { EmploymentType, Workplace } from "@pitchperfect/shared";

export const WORKPLACE_LABELS: Record<Workplace, string> = {
  onsite: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  internship: "Internship",
  contract: "Contract",
};

const POSTED = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** "Oct 12, 2026": the same on the server and in every visitor's time zone. */
export const formatPostedDate = (iso: string) => POSTED.format(new Date(iso));
