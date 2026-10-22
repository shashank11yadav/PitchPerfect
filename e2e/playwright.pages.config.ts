import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const ROOT = resolve(import.meta.dirname, "..");
const CI = Boolean(process.env.CI);

/** 3100, unless `E2E_PAGES_PORT` moves it. */
export const PAGES_PORT = process.env.E2E_PAGES_PORT ?? "3100";
/** The export is served the way GitHub Pages serves a project site: under its base path. */
export const PAGES_BASE_PATH = "/PitchPerfect";
export const PAGES_URL = `http://localhost:${PAGES_PORT}${PAGES_BASE_PATH}`;

/**
 * The static demo (`npm run build:pages -w apps/web`, output in apps/web/out), served by a small
 * static server (e2e/pages/static-server.mjs). Nothing else runs: no api, coach or database.
 */
export default defineConfig({
  testDir: "./pages",
  outputDir: "../test-results/pages",
  forbidOnly: CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { outputFolder: "../playwright-report/pages", open: "never" }]],
  use: {
    baseURL: `${PAGES_URL}/`,
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
  webServer: {
    command: `node e2e/pages/static-server.mjs --dir apps/web/out --base ${PAGES_BASE_PATH} --port ${PAGES_PORT}`,
    cwd: ROOT,
    url: `${PAGES_URL}/`,
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
