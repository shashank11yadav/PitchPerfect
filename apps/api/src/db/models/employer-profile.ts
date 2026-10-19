import { model, Schema, type Types } from "mongoose";
import { schemaOptions } from "../schema-options.js";

export interface EmployerProfileAttrs {
  userId: Types.ObjectId;
  jobTitle: string;
  companyId: Types.ObjectId;
}

const employerProfileSchema = new Schema<EmployerProfileAttrs>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    jobTitle: { type: String, required: true, trim: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, unique: true },
  },
  schemaOptions(),
);

export const EmployerProfile = model<EmployerProfileAttrs>(
  "EmployerProfile",
  employerProfileSchema,
);
