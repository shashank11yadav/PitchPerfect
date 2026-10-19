import { model, Schema, type Types } from "mongoose";
import { AUTH_TOKEN_TYPES, type AuthTokenType } from "@pitchperfect/shared";
import { schemaOptions } from "../schema-options.js";

export interface AuthTokenAttrs {
  userId: Types.ObjectId;
  type: AuthTokenType;
  /** sha256 of the emailed token; the raw token is never stored. */
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
}

const authTokenSchema = new Schema<AuthTokenAttrs>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: AUTH_TOKEN_TYPES, required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    usedAt: Date,
  },
  schemaOptions(["tokenHash"]),
);

export const AuthToken = model<AuthTokenAttrs>("AuthToken", authTokenSchema);
