import { afterEach, describe, expect, it } from "vitest";
import { LIMITS } from "@pitchperfect/shared";
import { Application, Company } from "../src/db/models/index.js";
import { makeTestApp } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import { createApplication, createJob, createStudent } from "./helpers/factories.js";
import { employerSession } from "./helpers/sessions.js";

useTestDb();

const { app, mailer } = makeTestApp();

afterEach(() => {
  mailer.sent.length = 0;
});

const inFuture = (days = 7) => new Date(Date.now() + days * 86_400_000).toISOString();

async function setup(options: Parameters<typeof employerSession>[1] = {}) {
  const employer = await employerSession(app, {
    companyName: "Applied Dynamics",
    website: "https://www.applied-dynamics.example",
    ...options,
  });
  const job = await createJob(employer.company._id, { title: "Field rep" });
  const shortlisted = async () => {
    const student = await createStudent();
    return createApplication({
      jobId: job._id,
      studentId: student.user._id,
      status: "shortlisted",
    });
  };
  const invite = (applicationId: string, meetingUrl = "https://us02web.zoom.us/j/123456789") =>
    employer.session
      .post(`/api/employer/applications/${applicationId}/interview`)
      .send({ startsAt: inFuture(), meetingUrl });
  return { ...employer, job, shortlisted, invite };
}

describe("who can send interview invites", () => {
  it("refuses an unverified company and sends nothing", async () => {
    const { invite, shortlisted } = await setup({ companyVerified: false });
    const application = await shortlisted();

    const res = await invite(application.id);

    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("company_unverified");
    expect((await Application.findById(application._id))?.status).toBe("shortlisted");
    expect(mailer.sent).toHaveLength(0);
  });

  it("refuses a suspended company and sends nothing", async () => {
    const { invite, shortlisted, company } = await setup();
    const application = await shortlisted();
    await Company.updateOne({ _id: company._id }, { verification: "suspended" });

    const res = await invite(application.id);

    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("company_suspended");
    expect(mailer.sent).toHaveLength(0);
  });
});

describe("meeting links", () => {
  it.each([
    "https://zoom.us/j/123",
    "https://us02web.zoom.us/j/123?pwd=abc",
    "https://meet.google.com/abc-defg-hij",
    "https://teams.microsoft.com/l/meetup-join/19%3ameeting",
    "https://teams.live.com/meet/9876",
    "https://acme-demo.webex.com/meet/riley",
    "https://whereby.com/applied-dynamics",
    "https://meet.applied-dynamics.example/riley",
    "https://applied-dynamics.example/interviews/riley",
  ])("accepts %s", async (meetingUrl) => {
    const { invite, shortlisted } = await setup();
    const application = await shortlisted();

    expect((await invite(application.id, meetingUrl)).status).toBe(200);
  });

  it.each([
    "https://evil.example/zoom.us/j/123",
    "https://zoom.us.evil.example/j/123",
    "https://notzoom.us/j/123",
    "https://meet.google.com.evil.example/abc",
    "https://docs.google.com/forms/d/abc",
    "https://applied-dynamics.example.evil.example/login",
    "https://203.0.113.7/j/123",
    "https://zoom.us./j/123",
  ])("refuses %s with a field error and sends nothing", async (meetingUrl) => {
    const { invite, shortlisted } = await setup();
    const application = await shortlisted();

    const res = await invite(application.id, meetingUrl);

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe("validation_failed");
    expect(errorOf(res).fields).toHaveProperty("meetingUrl");
    expect((await Application.findById(application._id))?.status).toBe("shortlisted");
    expect(mailer.sent).toHaveLength(0);
  });
});

describe("the invite email", () => {
  // The test company's website is on a reserved `.example` domain, so the email calls it a sample;
  // email-templates.test.ts covers the wording for a real verified company.
  it("names the link's real host in plain text, the company's standing, and the job", async () => {
    const { invite, shortlisted } = await setup();
    const application = await shortlisted();

    await invite(application.id, "https://us02web.zoom.us/j/123456789").expect(200);

    const [message] = mailer.sent;
    expect(message?.text).toContain("The meeting link opens us02web.zoom.us.");
    expect(message?.html).toContain("The meeting link opens us02web.zoom.us.");
    expect(message?.text).toContain("Applied Dynamics is a sample company on PitchPerfect");
    expect(message?.text).toMatch(
      /Open the job on PitchPerfect: http:\/\/localhost:3000\/jobs\/field-rep-/,
    );
  });
});

describe("invite limits", () => {
  it(`allows ${String(LIMITS.interviewInvitesPerApplicationPerDay)} invites per application a day`, async () => {
    const { invite, shortlisted } = await setup();
    const application = await shortlisted();
    for (let sent = 0; sent < LIMITS.interviewInvitesPerApplicationPerDay; sent += 1) {
      await invite(application.id).expect(200);
    }

    const res = await invite(application.id);

    expect(res.status).toBe(429);
    expect(errorOf(res).code).toBe("rate_limited");
    expect(res.headers["retry-after"]).toBeDefined();
    expect(mailer.sent).toHaveLength(LIMITS.interviewInvitesPerApplicationPerDay);
    // Another applicant still gets theirs.
    expect((await invite((await shortlisted()).id)).status).toBe(200);
  });

  it(`allows ${String(LIMITS.interviewInvitesPerHour)} invites per employer an hour`, async () => {
    const { invite, shortlisted } = await setup();
    for (let sent = 0; sent < LIMITS.interviewInvitesPerHour; sent += 1) {
      await invite((await shortlisted()).id).expect(200);
    }

    const res = await invite((await shortlisted()).id);

    expect(res.status).toBe(429);
    expect(errorOf(res).code).toBe("rate_limited");
    expect(mailer.sent).toHaveLength(LIMITS.interviewInvitesPerHour);
  });

  it("does not count refused invites", async () => {
    const { invite, shortlisted } = await setup();
    const application = await shortlisted();
    for (let tried = 0; tried < LIMITS.interviewInvitesPerApplicationPerDay + 1; tried += 1) {
      await invite(application.id, "https://evil.example/login").expect(400);
    }

    expect((await invite(application.id)).status).toBe(200);
  });
});
