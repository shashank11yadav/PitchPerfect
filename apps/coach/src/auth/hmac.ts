import { createHmac, timingSafeEqual } from "node:crypto";

/** A request is rejected when its timestamp is more than this many seconds from now. */
export const SIGNATURE_WINDOW_SEC = 60;

type HeaderValue = string | string[] | undefined;

const TIMESTAMP_PATTERN = /^\d{1,12}$/;
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/i;

/**
 * Checks `x-pp-timestamp` and `x-pp-signature` against the raw request body.
 * Anything malformed (missing, repeated, wrong length, not hex) is simply `false`; this never throws.
 */
export function verifySignature(
  secret: string,
  headers: Record<string, HeaderValue>,
  rawBody: string,
  nowSec: number,
): boolean {
  const timestamp = headers["x-pp-timestamp"];
  const signature = headers["x-pp-signature"];
  if (typeof timestamp !== "string" || typeof signature !== "string") return false;
  if (!TIMESTAMP_PATTERN.test(timestamp) || !SIGNATURE_PATTERN.test(signature)) return false;
  if (Math.abs(nowSec - Number(timestamp)) > SIGNATURE_WINDOW_SEC) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
