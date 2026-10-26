import type { Page } from "@playwright/test";
import { expect, test } from "../helpers/fixtures";
import { publicJob } from "../helpers/jobs";
import { WEB_URL } from "../helpers/stack";

const PUBLIC_PAGES = [
  "/",
  "/students",
  "/employers",
  "/how-it-works",
  "/jobs",
  "/about",
  "/privacy",
  "/terms",
];

type JsonLd = Record<string, unknown> | JsonLd[];

/** The top-level `@type`s in a JSON-LD value: one object, a list, or a `@graph`. */
function typesOf(data: JsonLd): string[] {
  if (Array.isArray(data)) return data.flatMap(typesOf);
  const graph = data["@graph"];
  if (Array.isArray(graph)) return typesOf(graph as JsonLd[]);
  return [String(data["@type"])];
}

/** The `@type`s of every JSON-LD block on the page. */
async function jsonLdTypes(page: Page): Promise<string[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((text) => typesOf(JSON.parse(text) as JsonLd));
}

/** The canonical link, on the site's origin, for `path` (a trailing slash either way). */
async function expectCanonical(page: Page, path: string): Promise<void> {
  const href = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(href, "canonical link").not.toBeNull();
  const url = new URL(href ?? "");
  expect(url.origin).toBe(WEB_URL);
  expect(url.pathname.replace(/\/$/, "")).toBe(path.replace(/\/$/, ""));
}

/** A search crawler, which Next answers with the whole page in one response. */
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

/**
 * The page as served, before any script runs, split at `</head>`: the title and description a
 * crawler reads must be in the head, and nothing in the body may carry its own.
 */
async function servedHead(page: Page, path: string, userAgent?: string) {
  const response = await page.request.get(path, {
    ...(userAgent && { headers: { "user-agent": userAgent } }),
  });
  const html = await response.text();
  const end = html.indexOf("</head>");
  expect(end, `${path} has a </head>`).toBeGreaterThan(0);
  return { status: response.status(), head: html.slice(0, end), body: html.slice(end) };
}

async function robots(page: Page): Promise<string | null> {
  const meta = page.locator('meta[name="robots"]');
  return (await meta.count()) > 0 ? meta.getAttribute("content") : null;
}

for (const path of PUBLIC_PAGES) {
  test(`${path} renders one h1 and its canonical link`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expectCanonical(page, path);
    expect(await robots(page)).toBeNull();
  });
}

test("the home page describes the site and its questions in JSON-LD", async ({ page }) => {
  await page.goto("/");
  expect(await jsonLdTypes(page)).toEqual(
    expect.arrayContaining(["Organization", "WebSite", "FAQPage"]),
  );
});

test("a verified company's job is indexable and has a JobPosting", async ({ page }) => {
  const job = await publicJob("verified");
  await page.goto(`/jobs/${job.slug}`);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toContainText(job.title);
  await expectCanonical(page, `/jobs/${job.slug}`);
  expect(await robots(page)).toBeNull();
  expect(await jsonLdTypes(page)).toContain("JobPosting");
});

test("an unverified company's job is noindex and has no JobPosting", async ({ page }) => {
  const job = await publicJob("unverified");
  const response = await page.goto(`/jobs/${job.slug}`);
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await robots(page)).toContain("noindex");
  expect(await jsonLdTypes(page)).not.toContain("JobPosting");
});

test("a job page is sent whole, with its title and description in <head>", async ({ page }) => {
  const job = await publicJob("verified");
  for (const userAgent of [undefined, GOOGLEBOT]) {
    const { status, head, body } = await servedHead(page, `/jobs/${job.slug}`, userAgent);
    expect(status).toBe(200);
    expect(head).toMatch(new RegExp(`<title>[^<]*${job.title}`));
    expect(head).toContain('<meta name="description"');
    expect(body).not.toContain("<title>");
    expect(body).not.toContain('<meta name="description"');
  }
});

test("an unknown job slug is a 404, with its title in <head>", async ({ page }) => {
  for (const userAgent of [undefined, GOOGLEBOT]) {
    const { status, head, body } = await servedHead(page, "/jobs/no-such-job-here", userAgent);
    expect(status).toBe(404);
    expect(head).toContain("<title>");
    expect(head).toContain('<meta name="robots" content="noindex');
    expect(body).not.toContain("<title>");
  }
});
