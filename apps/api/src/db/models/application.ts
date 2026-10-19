import { model, Schema, type Types } from "mongoose";
import {
  APPLICATION_CLOSED_REASONS,
  APPLICATION_STATUSES,
  type ApplicationClosedReason,
  type ApplicationStatus,
} from "@pitchperfect/shared";
import { schemaOptions } from "../schema-options.js";

/** Copied when the student applies, so the application can still be shown if the job is deleted. */
interface JobSnapshot {
  title: string;
  companyName: string;
}

export interface ApplicationAttrs {
  jobId: Types.ObjectId;
  studentId: Types.ObjectId;
  jobSnapshot: JobSnapshot;
  status: ApplicationStatus;
  /** Set when the system closed the application; null for ones closed by a person or still open. */
  closedReason: ApplicationClosedReason | null;
  savedByEmployer: boolean;
  sharedAttemptId?: Types.ObjectId;
  interview?: { startsAt: Date; meetingUrl: string };
  /** Set by mongoose timestamps. */
  createdAt: Date;
  updatedAt: Date;
}

const interviewSchema = new Schema<NonNullable<ApplicationAttrs["interview"]>>(
  {
    startsAt: { type: Date, required: true },
    meetingUrl: { type: String, required: true },
  },
  { _id: false },
);

const jobSnapshotSchema = new Schema<JobSnapshot>(
  {
    title: { type: String, required: true },
    companyName: { type: String, required: true },
  },
  { _id: false },
);

const applicationSchema = new Schema<ApplicationAttrs>(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    jobSnapshot: { type: jobSnapshotSchema, required: true },
    status: { type: String, enum: APPLICATION_STATUSES, default: "applied" },
    closedReason: { type: String, enum: APPLICATION_CLOSED_REASONS, default: null },
    savedByEmployer: { type: Boolean, default: false },
    sharedAttemptId: { type: Schema.Types.ObjectId, ref: "PracticeAttempt" },
    interview: interviewSchema,
  },
  schemaOptions(),
);

applicationSchema.index({ jobId: 1, studentId: 1 }, { unique: true });
applicationSchema.index({ studentId: 1 });
applicationSchema.index({ jobId: 1, status: 1 });

export const Application = model<ApplicationAttrs>("Application", applicationSchema);
