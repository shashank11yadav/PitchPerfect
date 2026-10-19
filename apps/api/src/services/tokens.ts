import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import type { AuthTokenType } from "@pitchperfect/shared";
import { AuthToken } from "../db/models/index.js";
import { ValidationError } from "../errors.js";

const TOKEN_BYTES = 32;

const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** 400 `invalid_token`: the same answer for missing, expired, used, and wrong-type tokens. */
export const invalidTokenError = () =>
  new ValidationError(undefined, "This link is invalid or has expired", "invalid_token");

/** Filter for an unused, unexpired token. `trusted` lets the `$gt` through `sanitizeFilter`. */
function liveTokenFilter(raw: unknown, type: AuthTokenType) {
  if (typeof raw !== "string") throw invalidTokenError();
  return {
    tokenHash: hashToken(raw),
    type,
    usedAt: null,
    expiresAt: mongoose.trusted({ $gt: new Date() }),
  };
}

/**
 * Issues a single-use token for an emailed link and returns it. Only its sha256 is stored, so a
 * database leak can't be replayed. Older unused tokens of the same type for the user stop working.
 */
export async function createToken(
  userId: string,
  type: AuthTokenType,
  ttlMs: number,
): Promise<string> {
  const raw = randomBytes(TOKEN_BYTES).toString("base64url");
  await AuthToken.deleteMany({ userId, type, usedAt: null });
  await AuthToken.create({
    userId,
    type,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return raw;
}

/** The user a live token belongs to, without using it up. Throws `invalid_token` otherwise. */
export async function peekToken(raw: string, type: AuthTokenType): Promise<string> {
  const doc = await AuthToken.findOne(liveTokenFilter(raw, type)).select("userId").lean();
  if (!doc) throw invalidTokenError();
  return doc.userId.toString();
}

/**
 * Uses up a token and returns its user id. Marking it used is one atomic update conditioned on
 * `usedAt: null`, so two concurrent requests can't both succeed. Missing, expired, used, or
 * wrong-type tokens throw `ValidationError` with code `invalid_token`.
 */
export async function consumeToken(raw: string, type: AuthTokenType): Promise<string> {
  const doc = await AuthToken.findOneAndUpdate(
    liveTokenFilter(raw, type),
    { $set: { usedAt: new Date() } },
    { projection: { userId: 1 } },
  ).lean();
  if (!doc) throw invalidTokenError();
  return doc.userId.toString();
}
