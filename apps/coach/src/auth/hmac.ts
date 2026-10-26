import { signingInput, type SignableRequest } from "@pitchperfect/shared/hmac";
import { createHmac, timingSafeEqual } from "node:crypto";

/** A request is rejected when its timestamp is more than this many seconds from now. */
export const SIGNATURE_WINDOW_SEC = 60;

type HeaderValue = string | string[] | undefined;

const TIMESTAMP_PATTERN = /^\d{1,12}$/;
const NONCE_PATTERN = /^[0-9a-f]{32}$/;
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/i;

/** A request whose signature checked out: its nonce, and when its timestamp leaves the window. */
export interface SignedRequest {
  nonce: string;
  expiresSec: number;
}

/**
 * Checks `x-pp-timestamp`, `x-pp-nonce` and `x-pp-signature` against the request's method, path
 * (no query) and raw body. Anything malformed (missing, repeated, wrong length, not hex) is simply
 * `undefined`; this never throws. It does not know which nonces were already used: the caller
 * remembers them (`NonceCache`) until `expiresSec`.
 */
export function verifySignature(
  secret: string,
  headers: Record<string, HeaderValue>,
  request: SignableRequest,
  nowSec: number,
): SignedRequest | undefined {
  const timestamp = headers["x-pp-timestamp"];
  const nonce = headers["x-pp-nonce"];
  const signature = headers["x-pp-signature"];
  if (typeof timestamp !== "string" || typeof nonce !== "string") return undefined;
  if (typeof signature !== "string") return undefined;
  if (!TIMESTAMP_PATTERN.test(timestamp) || !NONCE_PATTERN.test(nonce)) return undefined;
  if (!SIGNATURE_PATTERN.test(signature)) return undefined;
  if (Math.abs(nowSec - Number(timestamp)) > SIGNATURE_WINDOW_SEC) return undefined;

  const expected = createHmac("sha256", secret)
    .update(signingInput(timestamp, nonce, request))
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return undefined;
  return { nonce, expiresSec: Number(timestamp) + SIGNATURE_WINDOW_SEC };
}
