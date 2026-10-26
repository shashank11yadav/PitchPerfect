import { createHmac, randomBytes } from "node:crypto";

/** The parts of a request that a signature covers. `path` excludes the query string. */
export interface SignableRequest {
  method: string;
  path: string;
  body: string;
}

/** Random bytes in each request's nonce: 128 bits, sent as 32 hex characters. */
const NONCE_BYTES = 16;

/** The exact text that is signed; the coach rebuilds it from the request it receives. */
export function signingInput(
  timestamp: string,
  nonce: string,
  { method, path, body }: SignableRequest,
): string {
  return `${timestamp}.${nonce}.${method.toUpperCase()}.${path}.${body}`;
}

/**
 * Signs a request for the coach service: hex HMAC-SHA256 of
 * `${timestamp}.${nonce}.${METHOD}.${pathWithoutQuery}.${rawBody}`. The nonce is fresh for every
 * request, so two identical requests in the same second still differ, and the coach turns away
 * a nonce it has already seen.
 *
 * Server-side only. This module is published as the `@pitchperfect/shared/hmac` subpath, not from
 * the package root, so browser bundles that import the root never pull in `node:crypto`.
 */
export function signRequest(
  secret: string,
  request: SignableRequest,
  nowSec: number,
  nonce = randomBytes(NONCE_BYTES).toString("hex"),
): { "x-pp-timestamp": string; "x-pp-nonce": string; "x-pp-signature": string } {
  const timestamp = String(Math.trunc(nowSec));
  const signature = createHmac("sha256", secret)
    .update(signingInput(timestamp, nonce, request))
    .digest("hex");
  return { "x-pp-timestamp": timestamp, "x-pp-nonce": nonce, "x-pp-signature": signature };
}
