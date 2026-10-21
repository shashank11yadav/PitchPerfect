/**
 * The README screenshots, taken from a running stack with the demo data loaded:
 *
 *   docker compose --profile full up --build -d
 *   docker compose exec -e SEED_DEMO_PASSWORD=… api node dist/scripts/seed.js --demo
 *   SEED_DEMO_PASSWORD=… npx tsx e2e/screenshots.ts
 *
 * BASE_URL defaults to http://localhost:3000. Each run starts one practice call as the demo
 * student, so it uses one of that student's daily practice sessions.
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect, type Browser, type Page } from "@playwright/test";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const PASSWORD = process.env.SEED_DEMO_PASSWORD;
const OUT_DIR = resolve(import.meta.dirname, "../docs/images");
const VIEWPORT = { width: 1280, height: 800 };

/** What the student says on the call: an opener and a first value line. */
const LINES = [
  "Hi Sam, thanks for making time. I work with operations teams that lose hours every week chasing late shipments. How do you find out about a delay today?",
  "Got it, so someone checks the carrier sites by hand each morning. Teams like yours usually get most of that time back once delays alert the right person on their own. Who owns that check right now?",
];

async function signIn(browser: Browser, email: string, password: string): Promise<Page> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: VIEWPORT,
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "America/New_York",
  });
  const page = await context.newPage();
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname !== "/signin");
  return page;
}

async function shoot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(OUT_DIR, `${name}.png`), animations: "disabled" });
  console.log(`docs/images/${name}.png`);
}

async function home(browser: Browser): Promise<void> {
  const page = await browser.newPage({ baseURL: BASE_URL, viewport: VIEWPORT });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await shoot(page, "home");
  await page.close();
}

/**
 * A pitching call two turns in. The call is then ended, so no session is left open, and the
 * scorecard shown is the demo student's best one: a two-turn call scores low on purpose.
 */
async function practice(browser: Browser, password: string): Promise<void> {
  const page = await signIn(browser, "student@pitchperfect.example", password);
  await page.goto("/app/practice/pitching");
  await page.getByRole("button", { name: "Start the call" }).click();
  const transcript = page.getByRole("list", { name: "Transcript" }).getByRole("listitem");
  await expect(transcript).toHaveCount(1);
  await page.getByRole("button", { name: "Type instead" }).click();
  const box = page.getByLabel("Your turn");
  for (const [index, line] of LINES.entries()) {
    await box.fill(line);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(transcript).toHaveCount(1 + 2 * (index + 1));
  }
  await shoot(page, "practice-room");

  await page.getByRole("button", { name: "End session" }).click();
  await page
    .getByRole("dialog", { name: "End this session?" })
    .getByRole("button", { name: "End and score" })
    .click();
  await expect(page.getByRole("article", { name: /^Pitching with / })).toBeVisible({
    timeout: 30_000,
  });

  const response = await page.request.get("/api/practice/attempts");
  const { items } = (await response.json()) as {
    items: { id: string; overall: number | null }[];
  };
  const best = items.reduce((a, b) => ((b.overall ?? -1) > (a.overall ?? -1) ? b : a));
  await page.goto(`/app/practice/attempt/${best.id}`);
  await expect(page.getByRole("article", { name: / with / })).toBeVisible();
  await shoot(page, "scorecard");
  await page.context().close();
}

/** The applicant pipeline of the demo employer's job that has an applicant, one opened. */
async function pipeline(browser: Browser, password: string): Promise<void> {
  const page = await signIn(browser, "employer@pitchperfect.example", password);
  const response = await page.request.get("/api/employer/jobs");
  const { items } = (await response.json()) as {
    items: { id: string; applicantCount: number }[];
  };
  const job = items.find((item) => item.applicantCount > 0);
  if (!job) throw new Error("No demo job has an applicant. Run the seed with --demo first.");
  await page.goto(`/employer/jobs/${job.id}/applicants`);
  // The demo student, who applied to it in the seed.
  await page.getByRole("button", { name: "Riley Hartwell" }).click();
  await page.waitForLoadState("networkidle");
  await shoot(page, "employer-pipeline");
  await page.context().close();
}

if (!PASSWORD) {
  console.error("Set SEED_DEMO_PASSWORD to the password the demo seed used.");
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch({ channel: "chromium" });
try {
  await home(browser);
  await practice(browser, PASSWORD);
  await pipeline(browser, PASSWORD);
} finally {
  await browser.close();
}
