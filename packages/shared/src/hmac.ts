import { createHmac } from "node:crypto";

/** The parts of a request that a signature covers. `path` excludes the query string. */
export interface SignableRequest {
  method: string;
  path: string;
  body: string;
}

/** The exact text that is signed; the coach rebuilds it from the request it receives. */
export function signingInput(timestamp: string, { method, path, body }: SignableRequest): string {
  return `${timestamp}.${method.toUpperCase()}.${path}.${body}`;
}

/**
 * Signs a request for the coach service: hex HMAC-SHA256 of
 * `${timestamp}.${METHOD}.${pathWithoutQuery}.${rawBody}`.
 *
 * Server-side only. This module is published as the `@pitchperfect/shared/hmac` subpath, not from
 * the package root, so browser bundles that import the root never pull in `node:crypto`.
 */
export function signRequest(
  secret: string,
  request: SignableRequest,
  nowSec: number,
): { "x-pp-timestamp": string; "x-pp-signature": string } {
  const timestamp = String(Math.trunc(nowSec));
  const signature = createHmac("sha256", secret)
    .update(signingInput(timestamp, request))
    .digest("hex");
  return { "x-pp-timestamp": timestamp, "x-pp-signature": signature };
}
