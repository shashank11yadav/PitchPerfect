import { expect, type APIResponse } from "@playwright/test";

/** The nonce in a `script-src 'nonce-…'` directive, or undefined. */
export function cspNonce(csp: string | null | undefined): string | undefined {
  return /script-src[^;]*'nonce-([A-Za-z0-9+/=]+)'/.exec(csp ?? "")?.[1];
}

/** The page headers docs/security.md requires on every HTML response. */
export function expectPageSecurityHeaders(response: APIResponse): void {
  const headers = response.headers();
  const csp = headers["content-security-policy"] ?? "";
  expect(csp, "CSP default-src").toContain("default-src 'self'");
  expect(csp, "CSP frame-ancestors").toContain("frame-ancestors 'none'");
  expect(csp, "CSP object-src").toContain("object-src 'none'");
  expect(cspNonce(csp), "CSP script nonce").toBeDefined();
  expect(csp, "no unsafe-inline scripts").not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("microphone=(self)");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["x-powered-by"]).toBeUndefined();
}

/** `GET /api/health` through the web origin: the proxy reaches the api, and the api its deps. */
export async function expectHealthy(response: APIResponse): Promise<void> {
  expect(response.status()).toBe(200);
  expect(response.headers()["x-powered-by"]).toBeUndefined();
  expect(await response.json()).toEqual({ status: "ok", db: "ok", coach: "ok" });
}
