import { model, Schema } from "mongoose";
import { schemaOptions } from "../schema-options.js";
import { ledgerMonthFields } from "./practice-start.js";

/**
 * A deleted student's practice ledger for the month it was deleted in, so that signing up again
 * with the same email doesn't give a fresh quota. It names no account: the only key is a keyed
 * hash of the normalized email. A new student account with that email takes the counts back into
 * its own `practicestarts` row; otherwise the row expires with the month.
 */
export interface PracticeHoldAttrs {
  /** Hex HMAC-SHA256 of the normalized email, keyed with `SESSION_SECRET`. */
  emailKey: string;
  /** UTC calendar month, `YYYY-MM`. */
  month: string;
  /** Starts that month. */
  starts: number;
  /** Starts per UTC day of the month, keyed `YYYY-MM-DD`. */
  days: Map<string, number>;
  /** Tokens per UTC day of the month, keyed `YYYY-MM-DD`. */
  tokens: Map<string, number>;
  /** The first moment of the next month; a TTL index removes the row then. */
  expiresAt: Date;
}

const practiceHoldSchema = new Schema<PracticeHoldAttrs>(
  {
    emailKey: { type: String, required: true, match: /^[0-9a-f]{64}$/ },
    ...ledgerMonthFields,
  },
  schemaOptions(),
);

practiceHoldSchema.index({ emailKey: 1, month: 1 }, { unique: true });

export const PracticeHold = model<PracticeHoldAttrs>("PracticeHold", practiceHoldSchema);
