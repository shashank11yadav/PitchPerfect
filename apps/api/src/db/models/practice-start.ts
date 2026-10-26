import { model, Schema, type Types } from "mongoose";
import { schemaOptions } from "../schema-options.js";

/**
 * One student's session starts and tokens in one UTC month, the counts the practice quota reads.
 * It lives apart from `practiceattempts` so that deleting an attempt never gives a start or its
 * tokens back.
 */
export interface PracticeStartAttrs {
  studentId: Types.ObjectId;
  /** UTC calendar month, `YYYY-MM`. */
  month: string;
  /** Starts this month. */
  starts: number;
  /** Starts per UTC day of the month, keyed `YYYY-MM-DD`. */
  days: Map<string, number>;
  /** Tokens the student's coach calls used per UTC day of the month, keyed `YYYY-MM-DD`. */
  tokens: Map<string, number>;
  /** The first moment of the next month; the row is not read after that. */
  expiresAt: Date;
}

/** A month's counts, as both the ledger and a deleted student's hold (`practiceholds`) keep them. */
export const ledgerMonthFields = {
  month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
  starts: { type: Number, default: 0, min: 0 },
  days: { type: Map, of: { type: Number, min: 0 }, default: {} },
  tokens: { type: Map, of: { type: Number, min: 0 }, default: {} },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
} as const;

const practiceStartSchema = new Schema<PracticeStartAttrs>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ...ledgerMonthFields,
  },
  schemaOptions(),
);

practiceStartSchema.index({ studentId: 1, month: 1 }, { unique: true });

export const PracticeStart = model<PracticeStartAttrs>("PracticeStart", practiceStartSchema);
