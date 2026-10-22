import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** WCAG 2.2 A and AA (docs/design-system.md, Accessibility). */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const BLOCKING = new Set(["serious", "critical"]);

/**
 * Fails on any serious or critical axe violation on the loaded page, once it has one `h1` and
 * nothing still loading. Minor and moderate findings don't fail the run; they're listed in the
 * report. `label` names the page in the report.
 */
export async function expectAxeClean(page: Page, label: string): Promise<void> {
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  for (const { id, impact, nodes } of violations) {
    test.info().annotations.push({
      type: "axe",
      description: `${label}: ${String(impact)} ${id} (${String(nodes.length)})`,
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
  expect(blocking, `serious or critical axe violations on ${label}`).toEqual([]);
}
