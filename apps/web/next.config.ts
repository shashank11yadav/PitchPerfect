import { fileURLToPath } from "node:url";
import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * `PAGES_EXPORT=1`: the static demo for GitHub Pages (docs/deploy.md). No server, so no rewrites,
 * headers or proxy; the site lives under `PAGES_BASE_PATH` and every page ends in a slash, the
 * way a static host serves `index.html` files.
 */
const pagesExport = process.env.PAGES_EXPORT === "1";
const pagesBasePath = process.env.PAGES_BASE_PATH ?? "/PitchPerfect";

/** Where `/api/*` is proxied. Read at build time: rewrites are compiled into the build. */
const apiOrigin = new URL(process.env.API_ORIGIN ?? "http://localhost:4000").origin;

/** docs/security.md "Security headers"; the nonce-based CSP is set per request in proxy.ts. */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const serverConfig: NextConfig = {
  // The container image (apps/web/Dockerfile) builds a self-contained server. Other builds keep the
  // normal output, which `next start` (e2e, Lighthouse) and Vercel expect.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  images: { remotePatterns: [] },
  experimental: {
    // Socket idle time allowed on proxied api calls. Above the api's 35 s practice partner
    // timeout, so a slow scoring call isn't cut off by the proxy first.
    proxyTimeout: 60_000,
  },
  headers: () => Promise.resolve([{ source: "/:path*", headers: securityHeaders }]),
  rewrites: () =>
    Promise.resolve([{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }]),
};

const exportConfig: NextConfig = {
  output: "export",
  // With `output: "export"` a custom distDir names the export's destination; the build's own
  // files still go to `.next`, as for any build.
  distDir: "out",
  basePath: pagesBasePath,
  assetPrefix: pagesBasePath,
  trailingSlash: true,
  // No image server on a static host; the only images are the brand SVGs and PNG icons.
  images: { unoptimized: true },
};

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // The monorepo root, so the build traces workspace packages and the single lockfile.
  turbopack: { root: fileURLToPath(new URL("../..", import.meta.url)) },
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  // Inlined into server and client code alike (lib/pages-export.ts reads them).
  env: {
    PAGES_EXPORT: pagesExport ? "1" : "",
    PAGES_BASE_PATH: pagesExport ? pagesBasePath : "",
  },
  ...(pagesExport ? exportConfig : serverConfig),
};

/**
 * Lessons (`content/lessons/*.mdx`) compile to React components at build time, styled through
 * `mdx-components.tsx`. Nothing runs in the browser that isn't a normal script chunk, so the CSP
 * is unchanged.
 */
const withMDX = createMDX({});

export default withMDX(nextConfig);
