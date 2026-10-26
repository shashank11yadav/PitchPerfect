import { model, Schema, type Types } from "mongoose";
import { schemaOptions } from "../schema-options.js";

/**
 * One student's session starts in one UTC month, the count the practice quota reads. It lives
 * apart from `practiceattempts` so that deleting an attempt never gives a start back.
 */
export interface PracticeStartAttrs {
  studentId: Types.ObjectId;
  /** UTC calendar month, `YYYY-MM`. */
  month: string;
  /** Starts this month. */
  starts: number;
  /** Starts per UTC day of the month, keyed `YYYY-MM-DD`. */
  days: Map<string, number>;
  /** The first moment of the next month; the row is not read after that. */
  expiresAt: Date;
}

const practiceStartSchema = new Schema<PracticeStartAttrs>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    starts: { type: Number, default: 0, min: 0 },
    days: { type: Map, of: { type: Number, min: 0 }, default: {} },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  schemaOptions(),
);

practiceStartSchema.index({ studentId: 1, month: 1 }, { unique: true });

export const PracticeStart = model<PracticeStartAttrs>("PracticeStart", practiceStartSchema);
