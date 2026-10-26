import { model, Schema, type Types } from "mongoose";
import { schemaOptions } from "../schema-options.js";

/**
 * An email change waiting for its link to be followed. The account keeps its address until then;
 * following the link applies the change if the new address is still free. One per user: a newer
 * request replaces it, and with it the older link.
 */
export interface EmailChangeAttrs {
  userId: Types.ObjectId;
  /** The address asked for, normalized like every stored email. */
  newEmail: string;
  /** sha256 of the emailed token; the raw token is never stored. */
  tokenHash: string;
  /** The link stops working then, and a TTL index removes the row. */
  expiresAt: Date;
}

const emailChangeSchema = new Schema<EmailChangeAttrs>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    newEmail: { type: String, required: true, lowercase: true, trim: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  schemaOptions(["tokenHash"]),
);

export const EmailChange = model<EmailChangeAttrs>("EmailChange", emailChangeSchema);
