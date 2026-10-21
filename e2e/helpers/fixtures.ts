import {
  test as base,
  expect,
  type BrowserContext,
  type BrowserContextOptions,
} from "@playwright/test";
import { WEB_URL } from "./stack";

/** Chrome's own console wording for a blocked resource, and the tag the init script logs with. */
const CSP_MESSAGE = /Content Security Policy|\[csp-violation\]/i;

/**
 * Records every CSP violation in `context`'s pages: the `securitypolicyviolation` event (reported
 * through the console by an init script, so it is seen however early it fires) and Chrome's own
 * "… violates the following Content Security Policy directive" console errors.
 */
async function watchCsp(context: BrowserContext, violations: string[]): Promise<void> {
  await context.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      // Runs in the page: its console is how the runner hears about the event.
      // eslint-disable-next-line no-console
      console.error(
        `[csp-violation] ${event.effectiveDirective} blocked ${event.blockedURI || "inline"} on ${event.documentURI}`,
      );
    });
  });
  context.on("console", (message) => {
    if (message.type() === "error" && CSP_MESSAGE.test(message.text())) {
      violations.push(message.text());
    }
  });
}

interface Fixtures {
  /** CSP violations seen in any page of the test; the test fails if there are any. */
  cspViolations: string[];
  /** Opens another browser context (a second user), guarded the same way and closed afterwards. */
  openContext: (options?: BrowserContextOptions) => Promise<BrowserContext>;
}

/**
 * Every spec uses this `test`: pages that break the Content Security Policy fail the test even
 * when the page looks fine, because a blocked script or style is a bug in production too.
 */
export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures must destructure their deps.
  cspViolations: async ({}, use) => {
    const violations: string[] = [];
    await use(violations);
    expect(violations, "Content Security Policy violations").toEqual([]);
  },
  context: async ({ context, cspViolations }, use) => {
    await watchCsp(context, cspViolations);
    await use(context);
  },
  openContext: async ({ browser, cspViolations }, use) => {
    const opened: BrowserContext[] = [];
    await use(async (options = {}) => {
      const context = await browser.newContext({ baseURL: WEB_URL, ...options });
      await watchCsp(context, cspViolations);
      opened.push(context);
      return context;
    });
    await Promise.all(opened.map((context) => context.close()));
  },
});

export { expect };
