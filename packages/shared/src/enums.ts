export const ROLES = ["student", "employer"] as const;
export type Role = (typeof ROLES)[number];

export const JOB_STATUSES = ["draft", "active", "archived"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const WORKPLACES = ["onsite", "hybrid", "remote"] as const;
export type Workplace = (typeof WORKPLACES)[number];

export const EMPLOYMENT_TYPES = ["internship", "full_time", "part_time", "contract"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const PAY_TYPES = ["range", "exact", "unpaid"] as const;
export type PayType = (typeof PAY_TYPES)[number];

export const CURRENCIES = ["USD", "EUR", "CAD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const PAY_FREQUENCIES = ["hourly", "weekly", "monthly", "annually"] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number];

export const APPLICATION_STATUSES = [
  "applied",
  "shortlisted",
  "interview",
  "hired",
  "rejected",
  "withdrawn",
  "closed",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const ATTEMPT_STATUSES = ["active", "completed", "abandoned", "ended_by_guard"] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const STAGES = ["opening", "discovery", "pitch", "objection", "close"] as const;
export type Stage = (typeof STAGES)[number];

export const COMPANY_VERIFICATION = ["verified", "unverified", "suspended"] as const;
export type CompanyVerification = (typeof COMPANY_VERIFICATION)[number];

export const TRANSCRIPT_ROLES = ["student", "partner"] as const;
export type TranscriptRole = (typeof TRANSCRIPT_ROLES)[number];

export const LLM_PROVIDERS = ["openai", "anthropic", "fake"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export const US_STATES = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
] as const;
export type UsStateCode = (typeof US_STATES)[number]["code"];

export const US_STATE_CODES: readonly UsStateCode[] = US_STATES.map((state) => state.code);

export type ApplicationActor = "employer" | "student" | "system";

type TransitionTable = Partial<Record<ApplicationStatus, readonly ApplicationStatus[]>>;

/** Allowed application status changes per actor. Anything not listed is forbidden. */
export const APPLICATION_TRANSITIONS: Record<ApplicationActor, TransitionTable> = {
  employer: {
    applied: ["shortlisted", "rejected"],
    shortlisted: ["interview", "rejected"],
    // interview -> interview reschedules the interview.
    interview: ["interview", "hired", "rejected"],
  },
  student: {
    applied: ["withdrawn"],
    shortlisted: ["withdrawn"],
    interview: ["withdrawn"],
  },
  system: {
    applied: ["closed"],
    shortlisted: ["closed"],
    interview: ["closed"],
  },
};

export function canTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
  actor: ApplicationActor,
): boolean {
  return APPLICATION_TRANSITIONS[actor][from]?.includes(to) ?? false;
}
