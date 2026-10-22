import type { Page } from "@playwright/test";
import { EMPLOYER_STATE, STUDENT_STATE } from "../helpers/accounts";
import { expectAxeClean } from "../helpers/axe";
import { expect, test } from "../helpers/fixtures";
import { publicJob } from "../helpers/jobs";

/** Loads `path`, waits for its data, and fails on any serious or critical axe violation. */
async function expectNoSeriousViolations(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  // A signed-in page that bounced to sign-in would still pass, so check where we are.
  expect(new URL(page.url()).pathname).toBe(path);
  await expectAxeClean(page, path);
}

test.describe("public pages", () => {
  for (const path of ["/", "/students", "/employers", "/jobs", "/signin", "/signup/student"]) {
    test(`${path} has no serious or critical violations`, async ({ page }) => {
      await expectNoSeriousViolations(page, path);
    });
  }

  test("a job page has no serious or critical violations", async ({ page }) => {
    const job = await publicJob("verified");
    await expectNoSeriousViolations(page, `/jobs/${job.slug}`);
  });
});

test.describe("student app", () => {
  test.use({ storageState: STUDENT_STATE });

  for (const path of ["/app", "/app/practice/pitching"]) {
    test(`${path} has no serious or critical violations`, async ({ page }) => {
      await expectNoSeriousViolations(page, path);
    });
  }
});

test.describe("employer app", () => {
  test.use({ storageState: EMPLOYER_STATE });

  test("/employer has no serious or critical violations", async ({ page }) => {
    await expectNoSeriousViolations(page, "/employer");
  });
});
