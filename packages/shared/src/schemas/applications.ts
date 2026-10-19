import { z } from "zod";
import type { ApplicationStatus } from "../enums.js";
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
  appliedAt: string;
  updatedAt: string;
  job: { id: string; slug: string; title: string; companyName: string };
  interview: InterviewView | null;
  sharedAttemptId: string | null;
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
