import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { EMPLOYER_STATE, STUDENT_STATE } from "../helpers/accounts";
import { expect, test } from "../helpers/fixtures";
import { publicJob } from "../helpers/jobs";

/** WCAG 2.2 A and AA (docs/design-system.md, Accessibility). */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const BLOCKING = new Set(["serious", "critical"]);

/** Loads `path`, waits for its data, and fails on any serious or critical axe violation. */
async function expectNoSeriousViolations(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  // A signed-in page that bounced to sign-in would still pass, so check where we are.
  expect(new URL(page.url()).pathname).toBe(path);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  // Minor and moderate findings don't fail the run; they're listed in the report.
  for (const { id, impact, nodes } of violations) {
    test.info().annotations.push({
      type: "axe",
      description: `${path}: ${String(impact)} ${id} (${String(nodes.length)})`,
    });
  }
  const blocking = violations
    .filter((violation) => BLOCKING.has(violation.impact ?? ""))
    .map(({ id, impact, help, nodes }) => ({
      id,
      impact,
      help,
      targets: nodes.map((node) => node.target.join(" ")),
    }));
  expect(blocking, `serious or critical axe violations on ${path}`).toEqual([]);
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
