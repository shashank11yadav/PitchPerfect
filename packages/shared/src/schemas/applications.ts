import { z } from "zod";
import {
  APPLICATION_STATUSES,
  type ApplicationClosedReason,
  type ApplicationStatus,
} from "../enums.js";
import type { Scorecard } from "../rubric.js";
import type { SkillSlug } from "../skills.js";
import { httpsUrl, objectId, pageQuery } from "./common.js";
import type { ReportedPartnerKind } from "./practice.js";

export const ApplySchema = z.strictObject({ sharedAttemptId: objectId().optional() });
export type Apply = z.infer<typeof ApplySchema>;

/**
 * Statuses an employer can set through `PATCH /api/employer/applications/:id`. `interview` is
 * missing on purpose: only the interview endpoint sets it, because it comes with a slot.
 */
export const EMPLOYER_SETTABLE_STATUSES = ["shortlisted", "hired", "rejected"] as const;

export const ApplicationStatusUpdateSchema = z.strictObject({
  status: z.enum(EMPLOYER_SETTABLE_STATUSES),
});
export type ApplicationStatusUpdate = z.infer<typeof ApplicationStatusUpdateSchema>;

export const InterviewSchema = z.strictObject({
  startsAt: z.iso.datetime({ offset: true }).refine((value) => Date.parse(value) > Date.now(), {
    message: "Interview must be in the future",
  }),
  meetingUrl: httpsUrl(),
});
export type Interview = z.infer<typeof InterviewSchema>;

export interface InterviewView {
  startsAt: string;
  meetingUrl: string;
}

export interface StudentApplicationView {
  id: string;
  status: ApplicationStatus;
  /** Why the system closed the application; null otherwise. */
  closedReason: ApplicationClosedReason | null;
  appliedAt: string;
  updatedAt: string;
  /**
   * `title` and `companyName` are the ones recorded when the student applied. `slug` is null once
   * the job is no longer publicly listed (archived, deleted, or its company suspended).
   */
  job: { id: string; slug: string | null; title: string; companyName: string };
  interview: InterviewView | null;
  hasSharedScorecard: boolean;
  /** The practice attempt this application shares with the employer, if any. */
  sharedAttemptId: string | null;
}

export interface EmployerApplicationView {
  id: string;
  status: ApplicationStatus;
  appliedAt: string;
  savedByEmployer: boolean;
  student: { firstName: string; lastName: string; school: string; major: string; gradYear: number };
  /**
   * Whether the employer can download a résumé for this application now: one was attached, and
   * the application is open or ended less than `LIMITS.resumeAccessGraceDays` ago (never once
   * withdrawn).
   */
  hasResume: boolean;
  hasSharedScorecard: boolean;
  interview: InterviewView | null;
}

/** An applicant list: optionally one status and/or only the ones the employer saved. */
export const EmployerApplicationListQuerySchema = pageQuery.extend({
  status: z.enum(APPLICATION_STATUSES).optional(),
  saved: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
export type EmployerApplicationListQuery = z.infer<typeof EmployerApplicationListQuerySchema>;

export interface EmployerRecentApplication extends EmployerApplicationView {
  jobId: string;
  jobTitle: string;
}

/**
 * What an employer sees of a scorecard the student chose to share, with what the score rests on:
 * the scored student turns, which partner ran the call, and how long it lasted. A card shared
 * before the minimum of `LIMITS.shareMinStudentTurns` turns can have fewer.
 */
export interface SharedScorecardView {
  scorecard: Scorecard;
  skill: SkillSlug;
  completedAt: string | null;
  studentTurns: number;
  partner: ReportedPartnerKind;
  /** From the start of the call to its last line; null for a call with no lines. */
  durationSeconds: number | null;
}
