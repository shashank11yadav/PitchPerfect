import { model, Schema, type Types } from "mongoose";
import { schemaOptions } from "../schema-options.js";

/**
 * Kept for a suspended company so that deleting the account doesn't start it over. A held email
 * can't open an employer account, and no company on the held domain gets the badge, until an admin
 * lifts the hold (`npm run admin -- lift-hold`) or the suspension. Once the company is deleted the
 * row names no account: only keyed hashes of the owner's emails and the domain are left.
 */
export interface EmployerHoldAttrs {
  /** Hex HMAC-SHA256 of each normalized owner email held, keyed with `SESSION_SECRET`. */
  emailKeys: string[];
  /** The registrable domain the company was verified for; missing for one never verified. */
  domain?: string;
  /** The suspended company while it exists; removed when the company is deleted. */
  companyId?: Types.ObjectId;
  /** Set by mongoose timestamps. */
  createdAt: Date;
  updatedAt: Date;
}

const employerHoldSchema = new Schema<EmployerHoldAttrs>(
  {
    emailKeys: { type: [{ type: String, match: /^[0-9a-f]{64}$/ }], default: [], index: true },
    domain: { type: String, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company" },
  },
  schemaOptions(),
);

employerHoldSchema.index({ companyId: 1 }, { unique: true, sparse: true });

export const EmployerHold = model<EmployerHoldAttrs>("EmployerHold", employerHoldSchema);
