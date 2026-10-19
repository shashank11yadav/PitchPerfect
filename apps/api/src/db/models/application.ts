import { model, Schema, type Types } from "mongoose";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@pitchperfect/shared";
import { schemaOptions } from "../schema-options.js";

export interface ApplicationAttrs {
  jobId: Types.ObjectId;
  studentId: Types.ObjectId;
  status: ApplicationStatus;
  savedByEmployer: boolean;
  sharedAttemptId?: Types.ObjectId;
  interview?: { startsAt: Date; meetingUrl: string };
}

const interviewSchema = new Schema<NonNullable<ApplicationAttrs["interview"]>>(
  {
    startsAt: { type: Date, required: true },
    meetingUrl: { type: String, required: true },
  },
  { _id: false },
);

const applicationSchema = new Schema<ApplicationAttrs>(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: APPLICATION_STATUSES, default: "applied" },
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
