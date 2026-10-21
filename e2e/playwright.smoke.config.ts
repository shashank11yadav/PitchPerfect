import { defineConfig, devices } from "@playwright/test";

/**
 * Read-only checks against a running deployment (docs/deploy.md, Verify): public pages, the
 * api's health through the web origin, and the security headers. Nothing here signs in or writes.
 */
export default defineConfig({
  testDir: "./smoke",
  outputDir: "../test-results/smoke",
  retries: 1,
  timeout: 30_000,
  reporter: [["list"]],
  // `BASE_URL` is required; the spec says so when it's missing.
  use: { baseURL: process.env.BASE_URL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
