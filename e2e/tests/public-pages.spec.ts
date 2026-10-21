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
