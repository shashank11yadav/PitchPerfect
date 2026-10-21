import { fileURLToPath } from "node:url";
import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

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

const nextConfig: NextConfig = {
  // The container image (apps/web/Dockerfile) builds a self-contained server. Other builds keep the
  // normal output, which `next start` (e2e, Lighthouse) and Vercel expect.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  poweredByHeader: false,
  reactStrictMode: true,
  // The monorepo root, so the build traces workspace packages and the single lockfile.
  turbopack: { root: fileURLToPath(new URL("../..", import.meta.url)) },
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
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

/**
 * Lessons (`content/lessons/*.mdx`) compile to React components at build time, styled through
 * `mdx-components.tsx`. Nothing runs in the browser that isn't a normal script chunk, so the CSP
 * is unchanged.
 */
const withMDX = createMDX({});

export default withMDX(nextConfig);
