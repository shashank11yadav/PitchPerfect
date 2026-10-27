import { NextResponse, type NextRequest } from "next/server";
import { proxySecret } from "@/lib/proxy-secret";
import { hasSessionCookie } from "@/lib/site";

const PROTECTED_PREFIXES = ["/app", "/employer"];

const startsWithSegment = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * The policy from docs/security.md. Development adds what React's dev tooling needs; only an
 * explicit `NODE_ENV=development` (as `next dev` sets) does, so an unset one stays strict.
 */
function contentSecurityPolicy(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ]
    .map((directive) => `${directive};`)
    .join(" ");
}

/**
 * Pages no cache may keep, the browser's back/forward cache included: the signed-in app, and the
 * sign-in pages, whose forms take passwords and whose links carry one-time tokens.
 */
const NO_STORE_PREFIXES = [
  ...PROTECTED_PREFIXES,
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

/** A page, as HTML or as the payload a client-side navigation fetches; not an icon or a feed. */
const isPage = (request: NextRequest) =>
  request.headers.has("rsc") || (request.headers.get("accept") ?? "").includes("text/html");

/**
 * Every page renders per request (the CSP nonce), and Next marks such responses `no-store`, which
 * keeps every page out of the back/forward cache. Public pages only need to be fresh: `no-cache`
 * makes the browser ask again before reusing one, `private` keeps shared caches out (the page
 * differs with the session cookie), and the page can still be restored on Back. Sensitive pages
 * stay `no-store`. Anything else (icons, the manifest, feeds) keeps the caching Next gives it.
 */
function pageCacheControl(request: NextRequest): string | undefined {
  const { pathname } = request.nextUrl;
  if (NO_STORE_PREFIXES.some((prefix) => startsWithSegment(pathname, prefix))) {
    return "private, no-store";
  }
  return isPage(request) ? "private, no-cache" : undefined;
}

function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Requests that Next rewrites to the api (next.config.ts). Rewrites can't set headers, so they
 * are set here: the shared proxy secret, a fresh request id (the api keeps an id only from a
 * request with the secret, so a client never chooses its own), and the public protocol and host,
 * which the api trusts (`TRUST_PROXY`) to mark its cookies `Secure`. Cookies, the `__Host-`
 * prefixed ones included, go through as they came.
 */
function forwardToApi(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.delete("x-pp-proxy");
  const secret = proxySecret();
  if (secret) headers.set("x-pp-proxy", secret);
  headers.set("x-request-id", crypto.randomUUID());
  headers.set("x-forwarded-proto", request.nextUrl.protocol.replace(/:$/, ""));
  headers.set("x-forwarded-host", request.nextUrl.host);
  return NextResponse.next({ request: { headers } });
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  if (startsWithSegment(pathname, "/api")) return forwardToApi(request);

  // Only UX: pages still ask the api who is signed in, and the api is the real gate.
  const isProtected = PROTECTED_PREFIXES.some((prefix) => startsWithSegment(pathname, prefix));
  if (isProtected && !hasSessionCookie(request.cookies)) {
    const signin = new URL("/signin", request.nextUrl.origin);
    signin.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(signin);
  }

  const nonce = newNonce();
  const csp = contentSecurityPolicy(nonce);
  // Next reads the nonce from the request's CSP header and adds it to its own scripts.
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", csp);
  const cacheControl = pageCacheControl(request);
  if (cacheControl) response.headers.set("cache-control", cacheControl);
  return response;
}

export const config = {
  // Everything except build assets and static files, which carry no HTML.
  matcher: ["/((?!_next/static|_next/image|brand/|icons/|favicon.ico).*)"],
};
