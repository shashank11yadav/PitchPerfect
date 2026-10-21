import { afterEach, describe, expect, it } from "vitest";
import {
  RUBRIC_KEYS,
  type EmployerApplicationView,
  type EmployerDashboard,
  type Page,
  type Scorecard,
} from "@pitchperfect/shared";
import { Application, PracticeAttempt } from "../src/db/models/index.js";
import { makeTestApp } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import { createApplication, createAttempt, createJob, createStudent } from "./helpers/factories.js";
import { tinyPdf } from "./helpers/pdf.js";
import { employerSession, studentSession } from "./helpers/sessions.js";

useTestDb();

const { app, mailer } = makeTestApp();

afterEach(() => {
  mailer.sent.length = 0;
});

const pageOf = (res: { body: unknown }) => res.body as Page<EmployerApplicationView>;
const viewOf = (res: { body: unknown }) =>
  (res.body as { application: EmployerApplicationView }).application;

const scorecard: Scorecard = {
  overall: 72,
  dimensions: RUBRIC_KEYS.map((key) => ({
    key,
    score: 4 as const,
    justification: "Solid.",
    evidence: null,
  })),
  strengths: ["a", "b", "c"],
  improvements: ["d", "e", "f"],
  strongerLine: { original: "o", improved: "i" },
};

async function setup() {
  const employer = await employerSession(app, { companyName: "Applied Dynamics" });
  const job = await createJob(employer.company._id, { title: "Field rep" });
  const apply = async (
    status: "applied" | "shortlisted" | "interview" | "rejected" = "applied",
  ) => {
    const student = await createStudent();
    const application = await createApplication({
      jobId: job._id,
      studentId: student.user._id,
      status,
    });
    return { student, application };
  };
  return { ...employer, job, apply };
}

const inFuture = (days = 7) => new Date(Date.now() + days * 86_400_000).toISOString();

describe("GET /api/employer/jobs/:id/applications", () => {
  it("shows applicants with only the fields an employer needs", async () => {
    const { session, job, apply } = await setup();
    const { student, application } = await apply();

    const res = await session.agent.get(`/api/employer/jobs/${job.id}/applications`);

    expect(res.status).toBe(200);
    expect(pageOf(res)).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(pageOf(res).items[0]).toEqual({
      id: application.id,
      status: "applied",
      appliedAt: application.createdAt.toISOString(),
      savedByEmployer: false,
      student: {
        firstName: "Taylor",
        lastName: "Example",
        school: "Example State University",
        major: "Marketing",
        gradYear: student.profile.gradYear,
      },
      hasResume: false,
      hasSharedScorecard: false,
      interview: null,
    });
    expect(JSON.stringify(res.body)).not.toContain(student.email);
    expect(JSON.stringify(res.body)).not.toMatch(/studentId|email|race|passwordHash/);
  });

  it("reports whether a résumé and a shared scorecard exist", async () => {
    const { session, job } = await setup();
    const student = await studentSession(app);
    await student.session.put("/api/me/resume").attach("file", tinyPdf(), "cv.pdf").expect(200);
    const attempt = await createAttempt(student.user._id);
    await createApplication({
      jobId: job._id,
      studentId: student.user._id,
      sharedAttemptId: attempt._id,
    });

    const res = await session.agent.get(`/api/employer/jobs/${job.id}/applications`);

    expect(pageOf(res).items[0]).toMatchObject({ hasResume: true, hasSharedScorecard: true });
  });

  it("reports no shared scorecard once the attempt behind it is gone", async () => {
    const { session, job } = await setup();
    const student = await studentSession(app);
    const attempt = await createAttempt(student.user._id);
    await createApplication({
      jobId: job._id,
      studentId: student.user._id,
      sharedAttemptId: attempt._id,
    });
    await PracticeAttempt.deleteOne({ _id: attempt._id });

    const res = await session.agent.get(`/api/employer/jobs/${job.id}/applications`);

    expect(pageOf(res).items[0]).toMatchObject({ hasSharedScorecard: false });
  });

  it("filters by status and by saved, and paginates", async () => {
    const { session, job, apply } = await setup();
    const first = await apply("applied");
    await apply("shortlisted");
    await apply("rejected");
    await Application.updateOne(
      { _id: first.application._id },
      { $set: { savedByEmployer: true } },
    );
    const get = (query: string) =>
      session.agent.get(`/api/employer/jobs/${job.id}/applications${query}`);

    expect(pageOf(await get("?status=shortlisted")).items.map((item) => item.status)).toEqual([
      "shortlisted",
    ]);
    expect(pageOf(await get("?saved=true")).items.map((item) => item.id)).toEqual([
      first.application.id,
    ]);
    expect(pageOf(await get("?saved=false")).total).toBe(2);
    expect(pageOf(await get("")).total).toBe(3);
    const second = pageOf(await get("?pageSize=2&page=2"));
    expect(second).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(second.items).toHaveLength(1);
    expect((await get("?status=bogus")).status).toBe(400);
    expect((await get("?saved=maybe")).status).toBe(400);
    expect((await get("?pageSize=51")).status).toBe(400);
  });

  it("lists newest applications first", async () => {
    const { session, job, apply } = await setup();
    const older = await apply();
    const newer = await apply();

    const res = await session.agent.get(`/api/employer/jobs/${job.id}/applications`);

    expect(pageOf(res).items.map((item) => item.id)).toEqual([
      newer.application.id,
      older.application.id,
    ]);
  });
});

describe("PATCH /api/employer/applications/:id", () => {
  const patch = (
    session: Awaited<ReturnType<typeof setup>>["session"],
    id: string,
    status: string,
  ) => session.patch(`/api/employer/applications/${id}`).send({ status });

  it("follows the employer transitions, scheduling interviews through the interview endpoint", async () => {
    const { session, apply } = await setup();
    const { application } = await apply();

    const shortlisted = await patch(session, application.id, "shortlisted");
    await session
      .post(`/api/employer/applications/${application.id}/interview`)
      .send({ startsAt: inFuture(), meetingUrl: "https://meet.example/a" })
      .expect(200);
    const hired = await patch(session, application.id, "hired");

    expect(viewOf(shortlisted).status).toBe("shortlisted");
    expect(viewOf(hired).status).toBe("hired");
    expect((await Application.findById(application._id))?.status).toBe("hired");
  });

  it("refuses to set interview through PATCH, since it has no slot", async () => {
    const { session, apply } = await setup();
    const { application } = await apply("shortlisted");

    const res = await patch(session, application.id, "interview");

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe("validation_failed");
    expect((await Application.findById(application._id))?.status).toBe("shortlisted");
  });

  it.each(["hired", "rejected"] as const)(
    "drops the interview slot when moving to %s",
    async (to) => {
      const { session, apply } = await setup();
      const { application } = await apply("shortlisted");
      await session
        .post(`/api/employer/applications/${application.id}/interview`)
        .send({ startsAt: inFuture(), meetingUrl: "https://meet.example/a" })
        .expect(200);

      const res = await patch(session, application.id, to);

      expect(viewOf(res)).toMatchObject({ status: to, interview: null });
      expect((await Application.findById(application._id).lean())?.interview).toBeUndefined();
    },
  );

  it("rejects a transition the table forbids and leaves the status alone", async () => {
    const { session, apply } = await setup();
    const { application } = await apply();

    const res = await patch(session, application.id, "hired");

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe("invalid_transition");
    expect((await Application.findById(application._id))?.status).toBe("applied");
  });

  it("cannot change an application that is withdrawn, closed, hired or rejected", async () => {
    const { session, job, apply } = await setup();
    for (const status of ["withdrawn", "closed", "hired", "rejected"] as const) {
      const student = await createStudent();
      const application = await createApplication({
        jobId: job._id,
        studentId: student.user._id,
        status,
      });
      const res = await patch(session, application.id, "shortlisted");
      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe("invalid_transition");
    }
    await apply();
  });

  it("only accepts the settable statuses", async () => {
    const { session, apply } = await setup();
    const { application } = await apply();
    for (const status of ["closed", "withdrawn", "applied", "nope"]) {
      const res = await patch(session, application.id, status);
      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe("validation_failed");
    }
  });

  it("refuses extra fields", async () => {
    const { session, apply } = await setup();
    const { application } = await apply();
    const res = await session
      .patch(`/api/employer/applications/${application.id}`)
      .send({ status: "shortlisted", studentId: "507f1f77bcf86cd799439011" });
    expect(res.status).toBe(400);
  });
});

describe("PUT/DELETE /api/employer/applications/:id/save", () => {
  it("sets and clears the flag, idempotently", async () => {
    const { session, apply } = await setup();
    const { application } = await apply();
    const path = `/api/employer/applications/${application.id}/save`;
    const saved = async () => (await Application.findById(application._id))?.savedByEmployer;

    expect((await session.put(path)).status).toBe(204);
    expect((await session.put(path)).status).toBe(204);
    expect(await saved()).toBe(true);
    expect((await session.delete(path)).status).toBe(204);
    expect((await session.delete(path)).status).toBe(204);
    expect(await saved()).toBe(false);
  });

  it("keeps the application status", async () => {
    const { session, apply } = await setup();
    const { application } = await apply("shortlisted");
    await session.put(`/api/employer/applications/${application.id}/save`).expect(204);
    expect((await Application.findById(application._id))?.status).toBe("shortlisted");
  });
});

describe("POST /api/employer/applications/:id/interview", () => {
  const schedule = (
    session: Awaited<ReturnType<typeof setup>>["session"],
    id: string,
    body: object,
  ) => session.post(`/api/employer/applications/${id}/interview`).send(body);

  it("schedules from shortlisted, stores UTC, and emails the student", async () => {
    const { session, apply } = await setup();
    const { application, student } = await apply("shortlisted");

    const res = await schedule(session, application.id, {
      startsAt: "2099-11-02T15:00:00-05:00",
      meetingUrl: "https://meet.example/room?x=1&y=2",
    });

    expect(res.status).toBe(200);
    expect(viewOf(res)).toMatchObject({
      status: "interview",
      interview: {
        startsAt: "2099-11-02T20:00:00.000Z",
        meetingUrl: "https://meet.example/room?x=1&y=2",
      },
    });
    const stored = await Application.findById(application._id).lean();
    expect(stored?.interview?.startsAt.toISOString()).toBe("2099-11-02T20:00:00.000Z");
    expect(mailer.sent).toHaveLength(1);
    const [message] = mailer.sent;
    expect(message?.to).toBe(student.email);
    expect(message?.subject).toContain("Field rep");
    expect(message?.text).toContain("20:00 UTC");
    expect(message?.text).toContain("November 2, 2099");
    expect(message?.text).toContain("https://meet.example/room?x=1&y=2");
    expect(message?.html).toContain("x=1&amp;y=2");
    expect(message?.text).toContain("Applied Dynamics");
  });

  it("reschedules an application that is already in interview", async () => {
    const { session, apply } = await setup();
    const { application } = await apply("shortlisted");
    await schedule(session, application.id, {
      startsAt: inFuture(3),
      meetingUrl: "https://meet.example/a",
    }).expect(200);

    const res = await schedule(session, application.id, {
      startsAt: "2099-01-05T10:00:00Z",
      meetingUrl: "https://meet.example/b",
    });

    expect(res.status).toBe(200);
    expect(viewOf(res).interview).toEqual({
      startsAt: "2099-01-05T10:00:00.000Z",
      meetingUrl: "https://meet.example/b",
    });
    expect(mailer.sent).toHaveLength(2);
  });

  it("rejects a start time in the past and a non-https link", async () => {
    const { session, apply } = await setup();
    const { application } = await apply("shortlisted");

    const past = await schedule(session, application.id, {
      startsAt: "2020-01-01T10:00:00Z",
      meetingUrl: "https://meet.example/a",
    });
    const http = await schedule(session, application.id, {
      startsAt: inFuture(),
      meetingUrl: "http://meet.example/a",
    });
    const noOffset = await schedule(session, application.id, {
      startsAt: "2099-01-01T10:00:00",
      meetingUrl: "https://meet.example/a",
    });

    expect(past.status).toBe(400);
    expect(errorOf(past).fields).toHaveProperty("startsAt");
    expect(http.status).toBe(400);
    expect(errorOf(http).fields).toHaveProperty("meetingUrl");
    expect(noOffset.status).toBe(400);
    expect((await Application.findById(application._id))?.status).toBe("shortlisted");
    expect(mailer.sent).toHaveLength(0);
  });

  it("is not allowed before shortlisting or after a decision", async () => {
    const { session, apply } = await setup();
    for (const status of ["applied", "rejected"] as const) {
      const { application } = await apply(status);
      const res = await schedule(session, application.id, {
        startsAt: inFuture(),
        meetingUrl: "https://meet.example/a",
      });
      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe("invalid_transition");
    }
    expect(mailer.sent).toHaveLength(0);
  });

  it("still schedules when the email cannot be sent", async () => {
    const { session, apply } = await setup();
    const { application } = await apply("shortlisted");
    mailer.failing = true;
    try {
      const res = await schedule(session, application.id, {
        startsAt: inFuture(),
        meetingUrl: "https://meet.example/a",
      });
      expect(res.status).toBe(200);
    } finally {
      mailer.failing = false;
    }
    expect((await Application.findById(application._id))?.status).toBe("interview");
  });
});

describe("GET /api/employer/applications/:id/resume", () => {
  it("streams the applicant's résumé as an attachment", async () => {
    const { session, job } = await setup();
    const student = await studentSession(app);
    await student.session.put("/api/me/resume").attach("file", tinyPdf(), "cv.pdf").expect(200);
    const application = await createApplication({ jobId: job._id, studentId: student.user._id });

    const res = await session.agent.get(`/api/employer/applications/${application.id}/resume`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("answers 404 not_found once the student has withdrawn", async () => {
    const { session, job } = await setup();
    const student = await studentSession(app);
    await student.session.put("/api/me/resume").attach("file", tinyPdf(), "cv.pdf").expect(200);
    const application = await createApplication({
      jobId: job._id,
      studentId: student.user._id,
      status: "withdrawn",
    });

    const res = await session.agent.get(`/api/employer/applications/${application.id}/resume`);

    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe("not_found");
  });

  it("answers 404 when the student has no résumé", async () => {
    const { session, apply } = await setup();
    const { application } = await apply();

    const res = await session.agent.get(`/api/employer/applications/${application.id}/resume`);

    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe("not_found");
  });
});

describe("GET /api/employer/applications/:id/scorecard", () => {
  async function shared(attemptStatus: "completed" | "active", withScorecard = true) {
    const context = await setup();
    const student = await createStudent();
    const attempt = await createAttempt(student.user._id);
    await PracticeAttempt.updateOne(
      { _id: attempt._id },
      {
        $set: {
          status: attemptStatus,
          skill: "objections",
          endedAt: new Date("2026-05-01T12:00:00Z"),
          ...(withScorecard ? { scorecard } : {}),
        },
      },
    );
    const application = await createApplication({
      jobId: context.job._id,
      studentId: student.user._id,
      sharedAttemptId: attempt._id,
    });
    return { ...context, application, attempt };
  }

  it("returns the scorecard the student shared", async () => {
    const { session, application } = await shared("completed");

    const res = await session.agent.get(`/api/employer/applications/${application.id}/scorecard`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      scorecard,
      skill: "objections",
      completedAt: "2026-05-01T12:00:00.000Z",
    });
    expect(JSON.stringify(res.body)).not.toMatch(/transcript|scenarioPrivate|hiddenObjections/);
  });

  it("answers 404 not_found for a withdrawn application, even with a stale share", async () => {
    const { session, application } = await shared("completed");
    await Application.updateOne({ _id: application._id }, { $set: { status: "withdrawn" } });

    const res = await session.agent.get(`/api/employer/applications/${application.id}/scorecard`);

    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe("not_found");
  });

  it("answers 404 not_shared when nothing is shared", async () => {
    const { session, apply } = await setup();
    const { application } = await apply();

    const res = await session.agent.get(`/api/employer/applications/${application.id}/scorecard`);

    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe("not_shared");
  });

  it("answers 404 not_shared when the attempt is gone or not completed", async () => {
    const gone = await shared("completed");
    await PracticeAttempt.deleteOne({ _id: gone.attempt._id });
    const active = await shared("active");

    for (const { session, application } of [gone, active]) {
      const res = await session.agent.get(`/api/employer/applications/${application.id}/scorecard`);
      expect(res.status).toBe(404);
      expect(errorOf(res).code).toBe("not_shared");
    }
  });
});

describe("GET /api/employer/dashboard", () => {
  it("counts jobs, open applicants and upcoming interviews, and lists the newest applications", async () => {
    const { session, company } = await employerSession(app);
    const other = await employerSession(app);
    const active = await createJob(company._id, { title: "Active one" });
    await createJob(company._id, { title: "Active two" });
    await createJob(company._id, { title: "Draft", status: "draft" });
    const archived = await createJob(company._id, { title: "Archived", status: "archived" });
    const foreign = await createJob(other.company._id);
    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);
    const meetingUrl = "https://meet.example/x";
    const rows: [typeof active, Partial<Parameters<typeof createApplication>[0]>][] = [
      [active, { status: "applied" }],
      [active, { status: "shortlisted" }],
      [active, { status: "interview", interview: { startsAt: future, meetingUrl } }],
      [active, { status: "interview", interview: { startsAt: past, meetingUrl } }],
      [active, { status: "hired" }],
      [active, { status: "withdrawn" }],
      [archived, { status: "closed" }],
      [archived, { status: "applied" }],
      [foreign, { status: "applied" }],
    ];
    for (const [job, extra] of rows) {
      const student = await createStudent();
      await createApplication({ jobId: job._id, studentId: student.user._id, ...extra });
    }

    const res = await session.agent.get("/api/employer/dashboard");

    expect(res.status).toBe(200);
    const body = res.body as EmployerDashboard;
    expect(body).toMatchObject({
      activeJobs: 2,
      drafts: 1,
      applicants: 5,
      interviewsUpcoming: 1,
    });
    expect(body.recentApplications).toHaveLength(5);
    expect(body.recentApplications[0]).toMatchObject({
      jobTitle: "Archived",
      jobId: archived.id,
      status: "applied",
      hasResume: false,
    });
    expect(JSON.stringify(body)).not.toMatch(/email/);
  });

  it("is all zeroes for a new company", async () => {
    const { session } = await employerSession(app);
    const res = await session.agent.get("/api/employer/dashboard");
    expect(res.body).toEqual({
      activeJobs: 0,
      drafts: 0,
      applicants: 0,
      interviewsUpcoming: 0,
      recentApplications: [],
    });
  });
});
