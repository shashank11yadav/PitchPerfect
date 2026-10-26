import { model, Schema, type Types } from "mongoose";
import { COMPANY_VERIFICATION, type CompanyVerification } from "@pitchperfect/shared";
import { schemaOptions } from "../schema-options.js";

/**
 * Why a company that had the badge lost it in a way only an admin can undo: it was renamed, or its
 * website moved to another domain.
 */
const VERIFICATION_LOCK_REASONS = ["renamed", "domain_changed"] as const;
export type VerificationLockReason = (typeof VERIFICATION_LOCK_REASONS)[number];

export interface CompanyAttrs {
  ownerId: Types.ObjectId;
  name: string;
  slug: string;
  website: string;
  linkedinUrl?: string;
  pitch: string;
  logoUrl?: string;
  verification: CompanyVerification;
  /**
   * The registrable domain the badge vouched for when the company was last verified, e.g.
   * "acme-demo.example". Kept after the badge is lost, as the record that it once had one.
   */
  verifiedDomain?: string;
  /** Set when the company loses the badge by a rename or domain move; only an admin approval clears it. */
  verificationLockedReason?: VerificationLockReason;
}

const companySchema = new Schema<CompanyAttrs>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    website: { type: String, required: true },
    linkedinUrl: String,
    pitch: { type: String, default: "" },
    logoUrl: String,
    verification: { type: String, enum: COMPANY_VERIFICATION, default: "unverified" },
    verifiedDomain: String,
    verificationLockedReason: { type: String, enum: VERIFICATION_LOCK_REASONS },
  },
  schemaOptions(),
);

export const Company = model<CompanyAttrs>("Company", companySchema);
