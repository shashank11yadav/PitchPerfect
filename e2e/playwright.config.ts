import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { assertInfraReachable } from "./global-setup";
import {
  API_ENV,
  API_URL,
  COACH_ENV,
  COACH_URL,
  WEB_ENV,
  WEB_PORT,
  WEB_URL,
} from "./helpers/stack";

const ROOT = resolve(import.meta.dirname, "..");
const CI = Boolean(process.env.CI);
/** Both sides of the web → api proxy check (docs/deploy.md), so the suite covers it too. */
const PROXY_SHARED_SECRET = "dev-only-e2e-proxy-shared-secret-0000000000";

// The services need MongoDB as soon as they start, before the global setup runs. Check it once,
// in the runner process, so a missing `npm run dev:infra` reads as that and not as a dead server.
if (process.env.TEST_WORKER_INDEX === undefined) await assertInfraReachable();

/**
 * The full stack, built (`npm run e2e` builds first): the practice partner with its offline `fake`
 * provider, the api on a throwaway `pitchperfect-e2e` database, and `next start`.
 */
export default defineConfig({
  testDir: "./tests",
  outputDir: "../test-results",
  globalSetup: "./global-setup.ts",
  // One worker: the journeys share the demo accounts, and the api allows one live practice
  // session per student.
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  // Sign-ups are limited to 3 an hour per address, and every run signs up two accounts.
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { outputFolder: "../playwright-report", open: "never" }]],
  use: {
    baseURL: WEB_URL,
    locale: "en-US",
    timezoneId: "America/New_York",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // Full Chromium, not the headless shell: the shell crashes in the speech recognition API.
      use: { ...devices["Desktop Chrome"], channel: "chromium" },
    },
  ],
  webServer: [
    {
      name: "coach",
      command: "npm run start -w apps/coach",
      cwd: ROOT,
      url: `${COACH_URL}/healthz`,
      env: COACH_ENV,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      name: "api",
      command: "npm run start -w apps/api",
      cwd: ROOT,
      url: `${API_URL}/api/health`,
      env: { ...API_ENV, PROXY_SHARED_SECRET },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      name: "web",
      command: `npx next start --port ${WEB_PORT}`,
      cwd: resolve(ROOT, "apps/web"),
      url: WEB_URL,
      env: { ...WEB_ENV, PROXY_SHARED_SECRET },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
