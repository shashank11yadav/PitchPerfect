import { model, Schema } from "mongoose";
import { ROLES, type Role } from "@pitchperfect/shared";
import { schemaOptions } from "../schema-options.js";

export interface UserAttrs {
  email: string;
  passwordHash: string;
  role: Role;
  name: { first: string; last: string };
  emailVerifiedAt?: Date;
  ageConfirmedAt?: Date;
  practiceConsentAt?: Date;
  /** Bumped to end every session at once (password reset/change); sessions store their copy. */
  sessionVersion: number;
}

const userSchema = new Schema<UserAttrs>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Excluded from queries unless asked for with `.select("+passwordHash")`.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    name: {
      first: { type: String, required: true, trim: true },
      last: { type: String, required: true, trim: true },
    },
    emailVerifiedAt: Date,
    ageConfirmedAt: Date,
    practiceConsentAt: Date,
    sessionVersion: { type: Number, default: 0, min: 0 },
  },
  schemaOptions(["passwordHash"]),
);

export const User = model<UserAttrs>("User", userSchema);
