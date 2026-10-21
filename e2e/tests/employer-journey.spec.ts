import type { Page } from "@playwright/test";
import { STUDENT_STATE, uniqueId, withApi } from "../helpers/accounts";
import { expect, test } from "../helpers/fixtures";
import { latestLinkFor } from "../helpers/mailpit";
import { E2E_PASSWORD } from "../helpers/stack";

const EMPLOYER_ZONE = "America/New_York";
const STUDENT_ZONE = "Asia/Tokyo";
const DEMO_STUDENT_NAME = "Riley Hartwell";

/** How `formatInterviewTime` (apps/web/lib/local-time.ts) shows a time in `timeZone`. */
const interviewTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  }).format(new Date(iso));

/** ICU puts a narrow no-break space before AM/PM; compare the words, not the spaces. */
const words = (text: string) => text.replace(/\s+/gu, " ").trim();

/** "2026-10-23", three days out, as a calendar date in `timeZone`. */
const dateIn = (timeZone: string, daysAhead: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(Date.now() + daysAhead * 86_400_000);

async function signUpEmployer(page: Page, email: string, website: string): Promise<void> {
  await page.goto("/signup/employer");
  await page.getByLabel("First name").fill("Avery");
  await page.getByLabel("Last name").fill("Quinlan");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Job title").fill("Sales manager");
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel("Company name").fill("Brightwater Freight Software");
  await page.getByLabel("Company website").fill(website);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

  await page.goto(await latestLinkFor(email, "/verify-email"));
  await expect(page.getByRole("heading", { name: "Your email is confirmed" })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Sign in" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/employer$/);
}

/** Posts a live job from the editor and returns its id. */
async function postJob(page: Page, title: string): Promise<string> {
  await page.goto("/employer/jobs/new");
  await page.getByLabel("Job title").fill(title);
  await page.getByLabel("Location").fill("Remote, US");
  await page.getByLabel("Workplace").selectOption("remote");
  await page.getByLabel("Job type").selectOption("full_time");
  await page.getByLabel("Lowest").fill("48,000");
  await page.getByLabel("Highest").fill("56,000");
  const description = page.getByRole("textbox", { name: "Job description" });
  await description.click();
  await page.keyboard.type("Book first meetings with operations leads at mid-size carriers.");
  await page.getByPlaceholder("e.g. Cold outreach").fill("Discovery questions");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("list", { name: "Skills added" })).toContainText(
    "Discovery questions",
  );
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page).toHaveURL(/\/employer\/jobs\/[a-f0-9]{24}(\?created=published)?$/);
  const id = /\/employer\/jobs\/([a-f0-9]{24})/.exec(page.url())?.[1];
  expect(id, "the new job's id in the address").toBeDefined();
  return id ?? "";
}

test("an employer posts a job, shortlists an applicant, and books an interview", async ({
  page,
  openContext,
}) => {
  const id = uniqueId();
  const domain = `brightwater-${id}.example`;
  const title = `Sales development representative ${id}`;

  await signUpEmployer(page, `avery@${domain}`, `https://${domain}`);
  // The confirmed email is on the website's domain, so the company verified itself.
  await page.getByRole("link", { name: "Company" }).click();
  await expect(page.getByRole("region", { name: "Verified" })).toBeVisible();

  const jobId = await postJob(page, title);
  await page.goto("/jobs");
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  // The demo student applies through the api, as the job page's Apply button does.
  await withApi(STUDENT_STATE, (api) => api.json("POST", `/jobs/${jobId}/apply`, {}));

  await page.goto(`/employer/jobs/${jobId}/applicants`);
  await page.getByRole("button", { name: DEMO_STUDENT_NAME }).click();
  const moves = page.getByRole("group", { name: "Move this application" });
  await moves.getByRole("button", { name: "Shortlist" }).click();
  await expect(page.getByRole("region", { name: DEMO_STUDENT_NAME })).toContainText("Shortlisted");

  await moves.getByRole("button", { name: "Schedule interview" }).click();
  const dialog = page.getByRole("dialog", { name: "Schedule an interview with Riley" });
  await dialog.getByLabel("Date and time").fill(`${dateIn(EMPLOYER_ZONE, 3)}T14:30`);
  await dialog.getByLabel("Meeting link").fill(`https://meet.${domain}/riley`);
  await dialog.getByRole("button", { name: "Send invite" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "Interview booked for" })).toBeVisible();

  const booked = page
    .getByRole("region", { name: DEMO_STUDENT_NAME })
    .locator("p", { hasText: "Interview:" })
    .locator("time");
  const startsAt = (await booked.getAttribute("datetime")) ?? "";
  // Picked at 2:30 PM in the employer's zone, stored as UTC.
  expect(words(interviewTime(startsAt, EMPLOYER_ZONE))).toContain("2:30 PM");
  expect(words(await booked.innerText())).toBe(words(interviewTime(startsAt, EMPLOYER_ZONE)));

  // The student, in another time zone, sees the same moment in their own local time.
  const student = await openContext({ storageState: STUDENT_STATE, timezoneId: STUDENT_ZONE });
  const studentPage = await student.newPage();
  await studentPage.goto("/app/applications");
  const application = studentPage.getByRole("listitem").filter({ hasText: title });
  await expect(application).toContainText("Interview");
  const slot = application.locator("p", { hasText: "Interview:" }).locator("time");
  await expect(slot).toHaveAttribute("datetime", startsAt);
  await expect(slot).toBeVisible();
  expect(words(await slot.innerText())).toBe(words(interviewTime(startsAt, STUDENT_ZONE)));
  await expect(application.getByRole("link", { name: /Join the interview/ })).toHaveAttribute(
    "href",
    `https://meet.${domain}/riley`,
  );
});
