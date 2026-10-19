import { createHmac } from "node:crypto";

/**
 * Signs a request for the coach service: hex HMAC-SHA256 of `${timestamp}.${rawBody}`.
 *
 * Server-side only. This module is published as the `@pitchperfect/shared/hmac` subpath, not from
 * the package root, so browser bundles that import the root never pull in `node:crypto`.
 */
export function signRequest(
  secret: string,
  body: string,
  nowSec: number,
): { "x-pp-timestamp": string; "x-pp-signature": string } {
  const timestamp = String(Math.trunc(nowSec));
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return { "x-pp-timestamp": timestamp, "x-pp-signature": signature };
}
