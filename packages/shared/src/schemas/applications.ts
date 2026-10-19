import { z } from "zod";
import type { ApplicationClosedReason, ApplicationStatus } from "../enums.js";
import { httpsUrl, objectId } from "./common.js";

export const ApplySchema = z.strictObject({ sharedAttemptId: objectId().optional() });
export type Apply = z.infer<typeof ApplySchema>;

/** Statuses an employer can set through `PATCH /api/employer/applications/:id`. */
export const EMPLOYER_SETTABLE_STATUSES = [
  "shortlisted",
  "interview",
  "hired",
  "rejected",
] as const;

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
}

export interface EmployerApplicationView {
  id: string;
  status: ApplicationStatus;
  appliedAt: string;
  savedByEmployer: boolean;
  student: { firstName: string; lastName: string; school: string; major: string; gradYear: number };
  hasResume: boolean;
  hasSharedScorecard: boolean;
  interview: InterviewView | null;
}
