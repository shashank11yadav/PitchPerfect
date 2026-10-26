/**
 * The static demo on GitHub Pages (docs/deploy.md, "GitHub Pages demo"). `PAGES_EXPORT=1` at
 * build time switches `next build` to a static export under `PAGES_BASE_PATH`; next.config.ts
 * inlines both variables, so server and client code read the same answer. Everything here is a
 * build-time constant: in a normal build `PAGES_EXPORT` is false and the base path is empty.
 */

export const PAGES_EXPORT = process.env.PAGES_EXPORT === "1";

/** Where the export is served from, without a trailing slash; empty in a normal build. */
export const BASE_PATH = PAGES_EXPORT ? (process.env.PAGES_BASE_PATH ?? "/PitchPerfect") : "";

/**
 * A root-relative path as the browser must address it. `Link` and the router add the base path
 * themselves; raw URLs (`history.replaceState`, a form's `action`, manifest icons) go through here.
 */
export const withBasePath = (path: string): string => `${BASE_PATH}${path}`;

/**
 * A plain form's `action`: the browser submits it as written, so it needs the base path and, in
 * the export, the trailing slash the static host serves the page under.
 */
export const formAction = (path: string): string => withBasePath(PAGES_EXPORT ? `${path}/` : path);

/**
 * `generateStaticParams` for a dynamic route that the export must pre-render. A static export
 * needs every dynamic route listed; the normal build must not have the export (a route with
 * `generateStaticParams` is treated as static-first), so this is the function in export mode and
 * `undefined` otherwise. Next reads the export's value, not its presence.
 */
export function exportOnly<T>(params: () => T[]): (() => T[]) | undefined {
  return PAGES_EXPORT ? params : undefined;
}

/**
 * `generateStaticParams` for the metadata routes (sitemap, robots, manifest), which have no
 * params. A static export needs them marked static; `dynamic` would have to be a literal and so
 * could not differ between builds, but Next takes a `generateStaticParams` function as the same
 * mark. The normal build gets `undefined` and keeps rendering them per request.
 */
export const staticMetadataRoute = exportOnly(() => [{}]);

/**
 * The policy a static host can set: as docs/security.md, minus what only a response header can
 * carry. There is no nonce in static HTML, so Next's inline bootstrap scripts need
 * 'unsafe-inline'; 'unsafe-eval' stays out, and `connect-src 'self'` keeps every request on the
 * page's own origin (the demo's partner runs in the browser and calls nothing). `frame-ancestors`
 * is left out because browsers ignore it in a `<meta>` policy and say so in the console.
 */
export const STATIC_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");
