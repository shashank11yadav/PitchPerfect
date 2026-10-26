import type { Page } from "@playwright/test";
import { uniqueId } from "../helpers/accounts";
import { expect, test } from "../helpers/fixtures";
import { publicJob } from "../helpers/jobs";
import { latestLinkFor } from "../helpers/mailpit";
import { E2E_PASSWORD } from "../helpers/stack";

/** Three turns that read like a real pitch, so the fake partner scores them. */
const TURNS = [
  "Hi Sam, thanks for taking the call. I help operations teams cut the time they spend chasing late shipments. How do you track delays today?",
  "That makes sense. Teams like yours usually save about five hours a week once alerts go to the right person automatically. What would that time be worth to you?",
  "Fair point on switching. Setup takes an afternoon and your team keeps the tools it already uses. Would that work for you?",
  "Could we book thirty minutes on Tuesday at 10am to walk through your current process and see if it fits?",
];

async function signUp(page: Page, email: string): Promise<void> {
  await page.goto("/signup/student");
  await page.getByLabel("First name").fill("Jordan");
  await page.getByLabel("Last name").fill("Ellery");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel("School").fill("Northfield Community College");
  await page.getByLabel("Major").fill("Communications");
  await page.getByLabel("Graduation year").selectOption({ index: 1 });
  await page.getByLabel("State").selectOption("OH");
  await page.getByLabel("Role you’re aiming for").fill("Sales development representative");
  await page.getByLabel("Industry").fill("Software");
  await page.getByLabel("I’m 18 or older").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
}

async function verifyAndSignIn(page: Page, email: string): Promise<void> {
  await page.goto(await latestLinkFor(email, "/verify-email"));
  await expect(page.getByRole("heading", { name: "Your email is confirmed" })).toBeVisible();
  // The token is taken out of the address bar once it's used.
  await expect(page).toHaveURL(/\/verify-email$/);

  await page.getByRole("main").getByRole("link", { name: "Sign in" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function completeLesson(page: Page): Promise<void> {
  await page.goto("/app/learn/pitching");
  const done = page.getByRole("button", { name: "Mark as done" });
  await expect(done).toHaveAttribute("aria-pressed", "false");
  await done.click();
  await expect(done).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status").filter({ hasText: "Marked as done." })).toBeVisible();
}

/**
 * Accepts the practice notice, talks four turns by typing (the fewest a shared scorecard needs),
 * and ends with a scorecard.
 */
async function practiceByText(page: Page): Promise<string> {
  await page.goto("/app/practice/pitching");
  const notice = page.getByRole("dialog", { name: "Before your first practice call" });
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "I understand" }).click();
  await expect(notice).toBeHidden();

  await page.getByRole("button", { name: "Start the call" }).click();
  const transcript = page.getByRole("list", { name: "Transcript" }).getByRole("listitem");
  await expect(transcript).toHaveCount(1);
  await page.getByRole("button", { name: "Type instead" }).click();

  const box = page.getByLabel("Your turn");
  for (const [index, turn] of TURNS.entries()) {
    await box.fill(turn);
    await page.getByRole("button", { name: "Send" }).click();
    // Each turn adds the student's line and the partner's reply.
    await expect(transcript).toHaveCount(1 + 2 * (index + 1));
    await expect(transcript.last()).not.toContainText("No reply came back");
  }
  await expect(page.getByText("16 turns left")).toBeVisible();

  await page.getByRole("button", { name: "End session" }).click();
  await page
    .getByRole("dialog", { name: "End this session?" })
    .getByRole("button", { name: "End and score" })
    .click();
  const scorecard = page.getByRole("article", { name: /^Pitching with / });
  await expect(scorecard).toBeVisible({ timeout: 30_000 });
  await expect(scorecard.getByText(/out of 100/).first()).toBeAttached();
  // The room moved to the attempt's own address when the call started.
  expect(new URL(page.url()).pathname).toMatch(/^\/app\/practice\/attempt\/[a-f0-9]{24}$/);
  return page.url();
}

test("a student signs up, learns, practices, and applies with a scorecard", async ({ page }) => {
  const email = `student-${uniqueId()}@e2e.example`;
  const job = await publicJob("verified");
  const jobName = `${job.title} at ${job.company.name}`;

  await signUp(page, email);
  await verifyAndSignIn(page, email);
  await completeLesson(page);
  const attemptUrl = await practiceByText(page);

  await page.goto(`/app/jobs/${job.slug}`);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Your application is in" }),
  ).toBeVisible();

  await page.goto(attemptUrl);
  const share = page.getByRole("region", { name: "Share with an application" });
  await expect(
    share.getByRole("combobox", { name: "Application" }).locator("option:checked"),
  ).toHaveText(jobName);
  await share.getByRole("button", { name: "Share", exact: true }).click();
  await expect(share.getByText(`Shared with ${jobName}`)).toBeVisible();

  await page.goto("/app/applications");
  const application = page.getByRole("listitem").filter({ hasText: job.title });
  await expect(application).toContainText(job.company.name);
  await expect(application).toContainText("Applied");
  await expect(application.getByRole("link", { name: "a practice scorecard" })).toHaveAttribute(
    "href",
    new URL(attemptUrl).pathname,
  );
});
