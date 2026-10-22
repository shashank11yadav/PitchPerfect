#!/usr/bin/env node
/**
 * Builds the static demo for GitHub Pages into apps/web/out (docs/deploy.md, "GitHub Pages demo"):
 * the shared packages first, then `next build` in export mode, then the `.nojekyll` marker so
 * Pages serves the `_next/` directory as it is.
 *
 *   npm run build:pages -w apps/web
 *
 * PAGES_BASE_PATH (default /PitchPerfect) and SITE_URL (default the project's Pages URL) can be
 * set in the environment for a fork served from somewhere else.
 */
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const web = resolve(import.meta.dirname, "..");
const root = resolve(web, "../..");
const out = resolve(web, "out");

const basePath = process.env.PAGES_BASE_PATH ?? "/PitchPerfect";
const siteUrl = process.env.SITE_URL ?? `https://shashank11yadav.github.io${basePath}`;

const run = (command, args, cwd, env = {}) => {
  execFileSync(command, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
};

run("npm", ["run", "build", "-w", "packages/shared", "-w", "packages/partner"], root);
// A fresh directory: the export never removes files an earlier one left behind.
rmSync(out, { recursive: true, force: true });
run("npx", ["next", "build"], web, {
  PAGES_EXPORT: "1",
  PAGES_BASE_PATH: basePath,
  SITE_URL: siteUrl,
  NEXT_TELEMETRY_DISABLED: "1",
});
writeFileSync(resolve(out, ".nojekyll"), "");
console.log(`Static demo written to apps/web/out for ${siteUrl}`);
