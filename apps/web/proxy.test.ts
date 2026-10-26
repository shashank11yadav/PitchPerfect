// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

const request = (path: string, init: { cookie?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(new URL(path, "https://pitchperfect.example"), {
    headers: { ...init.headers, ...(init.cookie ? { cookie: init.cookie } : {}) },
  });

/** The value a request header will have when Next forwards the request. */
const forwarded = (res: Response, name: string) => res.headers.get(`x-middleware-request-${name}`);

const nonceOf = (csp: string | null) => /'nonce-([^']+)'/.exec(csp ?? "")?.[1];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy: content security policy", () => {
  it("sends a strict CSP with a fresh nonce and passes the nonce to rendering", () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = proxy(request("/"));
    const csp = res.headers.get("content-security-policy");
    const nonce = nonceOf(csp);
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    for (const directive of [
      "default-src 'self'",
      `script-src 'self' 'nonce-${String(nonce)}' 'strict-dynamic'`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ]) {
      expect(csp).toContain(`${directive};`);
    }
    expect(csp).not.toContain("unsafe-eval");
    // Next reads the nonce from the request's CSP header while rendering.
    expect(forwarded(res, "content-security-policy")).toBe(csp);
    expect(forwarded(res, "x-nonce")).toBe(nonce);

    expect(nonceOf(proxy(request("/")).headers.get("content-security-policy"))).not.toBe(nonce);
  });

  it("allows eval only in development, for React's dev tooling", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(proxy(request("/")).headers.get("content-security-policy")).toContain("'unsafe-eval'");
  });

  it("keeps the strict policy when NODE_ENV is unset", () => {
    vi.stubEnv("NODE_ENV", undefined);
    expect(proxy(request("/")).headers.get("content-security-policy")).not.toContain("unsafe-eval");
  });
});

describe("proxy: route protection", () => {
  it.each(["/app", "/app/practice/pitching", "/employer", "/employer/jobs/new"])(
    "sends %s to sign-in without a session cookie",
    (path) => {
      const res = proxy(request(`${path}?tab=1`));
      expect(res.status).toBe(307);
      const location = new URL(res.headers.get("location") ?? "");
      expect(location.origin).toBe("https://pitchperfect.example");
      expect(location.pathname).toBe("/signin");
      expect(location.searchParams.get("next")).toBe(`${path}?tab=1`);
    },
  );

  it("lets requests with a session cookie through", () => {
    const res = proxy(request("/app/history", { cookie: "pp.sid=s%3Aabc" }));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("content-security-policy")).toContain("'nonce-");
  });

  it.each(["/", "/apply", "/applications", "/employers", "/jobs/app"])(
    "leaves %s public",
    (path) => {
      expect(proxy(request(path)).headers.get("location")).toBeNull();
    },
  );
});

describe("proxy: /api requests", () => {
  it("adds the shared proxy secret and replaces any client-supplied one", () => {
    vi.stubEnv("PROXY_SHARED_SECRET", "s".repeat(40));
    const res = proxy(request("/api/auth/me", { headers: { "x-pp-proxy": "forged" } }));
    expect(forwarded(res, "x-pp-proxy")).toBe("s".repeat(40));
    expect(res.headers.get("content-security-policy")).toBeNull();
  });

  it("strips a client-supplied secret when none is configured", () => {
    vi.stubEnv("PROXY_SHARED_SECRET", "");
    const res = proxy(request("/api/auth/me", { headers: { "x-pp-proxy": "forged" } }));
    expect(res.headers.get("x-middleware-override-headers")?.split(",")).not.toContain(
      "x-pp-proxy",
    );
    expect(forwarded(res, "x-pp-proxy")).toBeNull();
  });

  it("tells the api the public protocol and host so Secure cookies work", () => {
    const res = proxy(
      request("/api/auth/signin", { headers: { "x-forwarded-proto": "http, https" } }),
    );
    expect(forwarded(res, "x-forwarded-proto")).toBe("https");
    expect(forwarded(res, "x-forwarded-host")).toBe("pitchperfect.example");
  });
});
