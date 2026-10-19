import { model, Schema, type Types } from "mongoose";
import { COMPANY_VERIFICATION, type CompanyVerification } from "@pitchperfect/shared";
import { schemaOptions } from "../schema-options.js";

export interface CompanyAttrs {
  ownerId: Types.ObjectId;
  name: string;
  slug: string;
  website: string;
  linkedinUrl?: string;
  pitch: string;
  logoUrl?: string;
  verification: CompanyVerification;
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
  },
  schemaOptions(),
);

export const Company = model<CompanyAttrs>("Company", companySchema);
