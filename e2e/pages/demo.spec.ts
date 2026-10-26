import type { Page } from "@playwright/test";
import { expectAxeClean } from "../helpers/axe";
import { expect, test } from "../helpers/fixtures";
import { PAGES_BASE_PATH, PAGES_URL } from "../playwright.pages.config";

/**
 * The static demo, served from apps/web/out under its base path. Every test also fails on a CSP
 * violation in the page's console (helpers/fixtures.ts), which is how the `<meta>` policy is
 * checked: the page must load and run without tripping it.
 */

/** Relative to the base URL, which ends in a slash: "./jobs/" stays under the base path. */
const at = (path: string) => `./${path}`;
const href = (path: string) => `${PAGES_BASE_PATH}${path}`;

/**
 * What the visitor says to the buyer the scripted partner plays for a first pitching call (an IT
 * lead at a group of dental clinics): a question first, then a line that ties the offer to his
 * answer and asks for a meeting.
 */
const LINES = [
  "Hi Sam, thanks for making time. I work with clinic groups whose front desks spend hours a week on appointment reminders. How do your clinics handle reminders today?",
  "Got it, so the front desk phones everyone the day before. Groups like yours usually get most of that time back once reminders go out on their own. Could we book a 20-minute demo on Thursday at 10am?",
];

async function expectNoSeriousViolations(page: Page, path: string): Promise<void> {
  await page.goto(at(path));
  await page.waitForLoadState("networkidle");
  expect(new URL(page.url()).pathname).toBe(href(`/${path}`));
  await expectAxeClean(page, `/${path}`);
}

test("the home page renders under the base path with the demo banner and its policy", async ({
  page,
}) => {
  await page.goto(at(""));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Practice your pitch.");
  await expect(page.getByText("This is a static demo")).toContainText("scripted partner");
  await expect(page.getByRole("link", { name: "the code is on GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/shashank11yadav/PitchPerfect",
  );
  // The policy travels in the document: no server sets headers on Pages.
  const csp = page.locator('meta[http-equiv="Content-Security-Policy"]');
  await expect(csp).toHaveAttribute("content", /connect-src 'self'/);
  await expect(csp).not.toHaveAttribute("content", /unsafe-eval/);
  // First in <head> as served, so it governs every script and stylesheet the page loads. (Once
  // React hydrates it moves hoisted tags around; the browser has applied the policy by then.)
  const html = await (await page.request.get(at(""))).text();
  expect(html.slice(html.indexOf("<head>") + "<head>".length)).toMatch(
    /^<meta http-equiv="Content-Security-Policy"/,
  );
  // The share image is a real PNG file, so the host sends it as an image.
  const image = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(image).toMatch(/\/PitchPerfect\/opengraph-image\.png$/);
  // The tag names the Pages URL; the same path on this server is the file the export wrote.
  const served = await page.request.get(new URL(image ?? "", PAGES_URL).pathname);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/png");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://shashank11yadav.github.io/PitchPerfect/",
  );
});

test("the job board lists the seeded jobs, filters in the browser and opens a job", async ({
  page,
}) => {
  await page.goto(at("jobs/"));
  await expect(page.getByRole("heading", { name: /open roles$/ })).toBeVisible();
  const results = page.locator('section[aria-labelledby="results-heading"]');
  const first = results.locator('a[href*="/jobs/"]').first();
  const title = (await first.textContent())?.trim() ?? "";
  const target = await first.getAttribute("href");
  await first.click();
  await expect(page).toHaveURL(new RegExp(`${target ?? ""}$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
  await expect(page.getByRole("link", { name: "Practice for this job" })).toHaveAttribute(
    "href",
    /\/PitchPerfect\/practice\/\?jobId=[a-f0-9]{24}$/,
  );

  // Filters run over the baked board, from the URL the plain form produces.
  await page.goto(at("jobs/?q=discovery&workplace=remote"));
  await expect(
    page.getByRole("heading", { name: /jobs? match(?:es)? your search$/ }),
  ).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue("discovery");
  await page.goto(at("jobs/?q=zzzz"));
  await expect(page.getByRole("heading", { name: "No jobs match that search" })).toBeVisible();
});

test("the board says once that its jobs are samples, and no sample goes to search engines", async ({
  page,
}) => {
  await page.goto(at("jobs/"));
  await expect(page.getByText(/^The listings in this demo are samples/)).toHaveCount(1);

  const results = page.locator('section[aria-labelledby="results-heading"]');
  const target = (await results.locator('a[href*="/jobs/"]').first().getAttribute("href")) ?? "";
  // A natural slug: the title, then the company.
  expect(target).toMatch(/\/jobs\/[a-z-]+-[a-z]+(?:-[a-z]+)*\/$/);
  expect(target).not.toMatch(/demo\d/);
  await page.goto(target);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(jsonLd.join("\n")).not.toContain("JobPosting");
  await expect(page.getByText(/^The listings in this demo are samples/)).toHaveCount(0);

  const sitemap = await (await page.request.get(at("sitemap.xml"))).text();
  expect(sitemap).toContain("/PitchPerfect/jobs/</loc>");
  expect(sitemap).not.toMatch(/\/jobs\/[a-z0-9-]+\/<\/loc>/);
});

test("a lesson renders and leads into its practice room", async ({ page }) => {
  await page.goto(at("learn/pitching/"));
  await expect(page.getByRole("heading", { name: "Pitching", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How practice scores this skill" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Practice this skill" })).toHaveAttribute(
    "href",
    href("/practice/pitching/"),
  );
});

test("a practice call by text runs in the browser through to a scorecard", async ({ page }) => {
  // Nothing leaves the page: every request is for the site's own files.
  const origin = new URL(PAGES_URL).origin;
  const foreign: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith(origin)) foreign.push(request.url());
  });

  await page.goto(at("practice/pitching/"));
  const notice = page.getByRole("dialog", { name: "Before your first practice call" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Your practice partner is scripted.");
  // The in-browser wording, not the coach's: no server and no retention period here.
  await expect(notice).toContainText("Everything runs in this browser tab.");
  await expect(notice).not.toContainText("our own server");
  await expect(notice).not.toContainText("180 days");
  await notice.getByRole("button", { name: "I understand" }).click();
  await expect(notice).toBeHidden();

  await page.getByRole("button", { name: "Start the call" }).click();
  await expect(page.getByRole("heading", { name: "Pitching", level: 2 })).toBeVisible();
  const transcript = page.getByRole("list", { name: "Transcript" }).getByRole("listitem");
  await expect(transcript).toHaveCount(1);
  await expect(page.getByText("Scripted demo partner")).toBeVisible();

  // Chromium offers speech recognition, so the room starts in voice mode; this call is typed.
  const typeInstead = page.getByRole("button", { name: "Type instead" });
  if (await typeInstead.isVisible()) await typeInstead.click();
  const box = page.getByLabel("Your turn");
  for (const [index, line] of LINES.entries()) {
    await box.fill(line);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(transcript).toHaveCount(3 + index * 2);
  }

  await page.getByRole("button", { name: "End session" }).click();
  await page.getByRole("button", { name: "End and score" }).click();
  await expect(page.getByRole("heading", { name: /^Pitching with /, level: 2 })).toBeVisible();
  await expect(page.getByText(/^Scorecard, /)).toBeVisible();
  expect(foreign).toEqual([]);

  // The address names the session, so the scorecard survives a reload in this tab.
  expect(new URL(page.url()).pathname).toBe(href("/practice/attempt/"));
  await page.reload();
  await expect(page.getByRole("heading", { name: /^Pitching with /, level: 2 })).toBeVisible();
});

test("a turn that signals self-harm gets the support message, apart from the partner", async ({
  page,
}) => {
  await page.goto(at("practice/pitching/"));
  const notice = page.getByRole("dialog", { name: "Before your first practice call" });
  await notice.getByRole("button", { name: "I understand" }).click();
  await page.getByRole("button", { name: "Start the call" }).click();
  const typeInstead = page.getByRole("button", { name: "Type instead" });
  if (await typeInstead.isVisible()) await typeInstead.click();

  await page.getByLabel("Your turn").fill("Sorry, it's been a hard week. I want to end my life.");
  await page.getByRole("button", { name: "Send" }).click();

  const note = page.getByRole("note", { name: "A message from PitchPerfect" });
  await expect(note).toContainText("call or text 988");
  await expect(note).toContainText("findahelpline.com");
  await expect(page.getByText("20 turns left")).toBeVisible();
  await expect(page.getByText(/keep this to business/)).toHaveCount(0);
});

test("the sign-in route says there are no accounts in the demo", async ({ page }) => {
  await page.goto(at("signin/"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "There’s nothing to sign in to here",
  );
  await expect(page.getByRole("link", { name: "Try a practice call" })).toHaveAttribute(
    "href",
    href("/practice/"),
  );
  await expect(page.getByRole("link", { name: "Browse the jobs" })).toHaveAttribute(
    "href",
    href("/jobs/"),
  );
});

test("the footer and the about page name who built it and link out to him", async ({ page }) => {
  await page.goto(at("about/"));
  const footer = page.getByRole("contentinfo");
  await expect(footer).toContainText("Built by Shashank Yadav");
  await expect(footer.getByRole("link", { name: "GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/shashank11yadav",
  );
  await expect(footer.getByRole("link", { name: "shashankyadav.dev" })).toHaveAttribute(
    "href",
    "https://www.shashankyadav.dev/",
  );
  const main = page.getByRole("main");
  await expect(main).toContainText("Built by Shashank Yadav.");
  await expect(main).toContainText("its partner is the scripted one, running in your browser");
  await expect(main.getByRole("link", { name: "project's issues on GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/shashank11yadav/PitchPerfect/issues",
  );
  // The internal links keep the base path.
  await expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute(
    "href",
    href("/privacy/"),
  );
  await page.goto(at("privacy/"));
  await expect(
    page.getByRole("main").getByRole("link", { name: "Shashank Yadav on GitHub" }).first(),
  ).toHaveAttribute("href", "https://github.com/shashank11yadav");
});

test.describe("accessibility", () => {
  for (const path of ["", "jobs/", "practice/", "about/", "privacy/"]) {
    test(`/${path} has no serious or critical violations`, async ({ page }) => {
      await expectNoSeriousViolations(page, path);
    });
  }
});
