import type { Role } from "@pitchperfect/shared";
import { vi } from "vitest";

/** Test helpers for components that call the api through `apiFetch`. */

export type Route = (init: RequestInit | undefined) => Response | Promise<Response>;

export const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

export const errorResponse = (
  status: number,
  code: string,
  message: string,
  extra: { fields?: Record<string, string>; headers?: Record<string, string> } = {},
) =>
  jsonResponse(
    { error: { code, message, requestId: "r1", ...(extra.fields && { fields: extra.fields }) } },
    status,
    extra.headers,
  );

/** The parsed JSON body a route received. */
export const bodyOf = (init: RequestInit | undefined): unknown =>
  typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

/** A fictional `GET /api/auth/me` body. */
export function meBody(role: Role, { verified = true } = {}) {
  return {
    user: {
      id: "65f1c0ffee0000000000f00d",
      email: `${role}@example.test`,
      role,
      firstName: "Riley",
      lastName: "Hart",
      emailVerifiedAt: verified ? "2026-10-01T00:00:00.000Z" : null,
      practiceConsentAt: null,
    },
    profile: {},
  };
}

export const signedOut: Route = () => errorResponse(401, "unauthenticated", "Sign in first");
export const csrf: Route = () => jsonResponse({ csrfToken: "token-1" });

/**
 * Stubs `fetch` to answer `"METHOD /api/path"` keys. Anything else rejects, which fails the test.
 * Returns the mock so tests can count calls.
 */
export function serveApi(routes: Record<string, Route>) {
  const fetchMock = vi.fn<typeof fetch>((input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    const key = `${init?.method ?? "GET"} ${url}`;
    const route = routes[key];
    if (!route) return Promise.reject(new Error(`unexpected request ${key}`));
    return Promise.resolve(route(init));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** How many times `fetch` was called for `"METHOD /api/path"`. */
export function callsTo(fetchMock: ReturnType<typeof serveApi>, key: string): number {
  return fetchMock.mock.calls.filter(([input, init]) => {
    const url = input instanceof Request ? input.url : input.toString();
    return `${init?.method ?? "GET"} ${url}` === key;
  }).length;
}
