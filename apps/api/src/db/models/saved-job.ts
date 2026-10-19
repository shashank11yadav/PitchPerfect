import { model, Schema, type Types } from "mongoose";
import { schemaOptions } from "../schema-options.js";

export interface SavedJobAttrs {
  studentId: Types.ObjectId;
  jobId: Types.ObjectId;
}

const savedJobSchema = new Schema<SavedJobAttrs>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
  },
  schemaOptions(),
);

savedJobSchema.index({ studentId: 1, jobId: 1 }, { unique: true });

export const SavedJob = model<SavedJobAttrs>("SavedJob", savedJobSchema);
