import { expect, test } from "../helpers/fixtures";
import { expectHealthy, expectPageSecurityHeaders } from "../helpers/headers";

if (!process.env.BASE_URL) {
  throw new Error("Set BASE_URL to the site to check, e.g. BASE_URL=https://pitchperfect.example");
}

const PUBLIC_PAGES = ["/", "/students", "/employers", "/how-it-works", "/jobs", "/signin"];

for (const path of PUBLIC_PAGES) {
  test(`${path} loads with one h1 and no CSP violations`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
  });
}

test("the home page sends the security headers", async ({ request, baseURL }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  expectPageSecurityHeaders(response);
  if (baseURL?.startsWith("https://")) {
    expect(response.headers()["strict-transport-security"]).toContain("max-age=");
  }
});

test("the api is healthy through the web origin", async ({ request }) => {
  await expectHealthy(await request.get("/api/health"));
});
