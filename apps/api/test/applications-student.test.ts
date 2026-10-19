import mongoose from "mongoose";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { Page, StudentApplicationView } from "@pitchperfect/shared";
import { Application, Company, Job, PracticeAttempt } from "../src/db/models/index.js";
import { makeTestApp } from "./helpers/app.js";
import { csrfAgent } from "./helpers/csrf.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import {
  createApplication,
  createAttempt,
  createEmployer,
  createJob,
  createStudent,
  signIn,
} from "./helpers/factories.js";

useTestDb();

const { app } = makeTestApp();

const viewOf = (res: { body: unknown }) =>
  (res.body as { application: StudentApplicationView }).application;
const pageOf = (res: { body: unknown }) => res.body as Page<StudentApplicationView>;

async function studentSession(options: Parameters<typeof createStudent>[0] = {}) {
  const { email, password, user } = await createStudent(options);
  return { session: await signIn(request.agent(app), email, password), user };
}

async function openJob(options: Parameters<typeof createJob>[1] = {}) {
  const employer = await createEmployer({ companyName: "Applied Dynamics" });
  const job = await createJob(employer.company._id, options);
  return { ...employer, job };
}

const applyPath = (job: { _id: mongoose.Types.ObjectId }) =>
  `/api/jobs/${job._id.toString()}/apply`;

describe("POST /api/jobs/:id/apply", () => {
  it("creates an application with a snapshot of the job", async () => {
    const { job } = await openJob({ title: "Field sales rep" });
    const { session, user } = await studentSession();

    const res = await session.post(applyPath(job)).send({});

    expect(res.status).toBe(201);
    expect(viewOf(res)).toMatchObject({
      status: "applied",
      closedReason: null,
      interview: null,
      hasSharedScorecard: false,
      job: { id: job._id.toString(), slug: job.slug, title: "Field sales rep" },
    });
    const stored = await Application.findOne({ studentId: user._id }).lean();
    expect(stored?.jobSnapshot).toEqual({
      title: "Field sales rep",
      companyName: "Applied Dynamics",
    });
    expect(stored?.savedByEmployer).toBe(false);
    expect(stored?.sharedAttemptId).toBeUndefined();
  });

  it("answers 409 already_applied the second time and leaves the first untouched", async () => {
    const { job } = await openJob();
    const { session } = await studentSession();
    const first = await session.post(applyPath(job)).send({});
    const before = await Application.findOne({ jobId: job._id });

    const second = await session.post(applyPath(job)).send({});

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(errorOf(second).code).toBe("already_applied");
    const after = await Application.findOne({ jobId: job._id });
    expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
  });

  it("yields exactly one 201 and one 409 for parallel applies", async () => {
    const { job } = await openJob();
    const { session, user } = await studentSession();

    const results = await Promise.all([
      session.post(applyPath(job)).send({}),
      session.post(applyPath(job)).send({}),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    const loser = results.find((res) => res.status === 409);
    expect(loser && errorOf(loser).code).toBe("already_applied");
    expect(await Application.countDocuments({ studentId: user._id })).toBe(1);
  });

  it("does not allow applying again after withdrawing", async () => {
    const { job } = await openJob();
    const { session, user } = await studentSession();
    await createApplication({ jobId: job._id, studentId: user._id, status: "withdrawn" });

    const res = await session.post(applyPath(job)).send({});

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe("already_applied");
  });

  it("requires a verified email", async () => {
    const { job } = await openJob();
    const { session } = await studentSession({ verified: false });

    const res = await session.post(applyPath(job)).send({});

    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("email_not_verified");
  });

  it("requires a signed-in student", async () => {
    const { job, email, password } = await openJob();

    const anonymous = await csrfAgent(app);
    expect((await anonymous.post(applyPath(job)).send({})).status).toBe(401);
    const employer = await signIn(request.agent(app), email, password);
    expect((await employer.post(applyPath(job)).send({})).status).toBe(403);
    expect(await Application.countDocuments()).toBe(0);
  });

  it("404s for draft, archived, missing, and suspended-company jobs", async () => {
    const { company } = await createEmployer();
    const draft = await createJob(company._id, { status: "draft" });
    const archived = await createJob(company._id, { status: "archived" });
    const suspended = await openJob();
    await Company.updateOne({ _id: suspended.company._id }, { verification: "suspended" });
    const { session } = await studentSession();

    for (const job of [draft, archived, suspended.job]) {
      const res = await session.post(applyPath(job)).send({});
      expect(res.status).toBe(404);
    }
    const missing = await session.post(applyPath({ _id: new mongoose.Types.ObjectId() })).send({});
    expect(missing.status).toBe(404);
    const malformed = await session.post("/api/jobs/nope/apply").send({});
    expect(malformed.status).toBe(400);
    expect(await Application.countDocuments()).toBe(0);
  });

  it("rejects unknown body fields", async () => {
    const { job } = await openJob();
    const { session } = await studentSession();

    const res = await session.post(applyPath(job)).send({ status: "hired" });

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe("validation_failed");
  });

  it("attaches the student's own completed attempt", async () => {
    const { job } = await openJob();
    const { session, user } = await studentSession();
    const attempt = await createAttempt(user._id);

    const res = await session
      .post(applyPath(job))
      .send({ sharedAttemptId: attempt._id.toString() });

    expect(res.status).toBe(201);
    expect(viewOf(res).hasSharedScorecard).toBe(true);
    expect((await Application.findOne({ studentId: user._id }))?.sharedAttemptId).toEqual(
      attempt._id,
    );
  });

  it("404s for another student's attempt and creates nothing", async () => {
    const { job } = await openJob();
    const { session } = await studentSession();
    const other = await createStudent();
    const theirs = await createAttempt(other.user._id);

    const res = await session.post(applyPath(job)).send({ sharedAttemptId: theirs._id.toString() });
    const missing = await session
      .post(applyPath(job))
      .send({ sharedAttemptId: new mongoose.Types.ObjectId().toString() });

    expect(res.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await Application.countDocuments()).toBe(0);
  });

  it("rejects an attempt that isn't completed", async () => {
    const { job } = await openJob();
    const { session, user } = await studentSession();
    const attempt = await createAttempt(user._id);
    await PracticeAttempt.updateOne({ _id: attempt._id }, { status: "active" });

    const res = await session
      .post(applyPath(job))
      .send({ sharedAttemptId: attempt._id.toString() });

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe("validation_failed");
    expect(errorOf(res).fields).toHaveProperty("sharedAttemptId");
    expect(await Application.countDocuments()).toBe(0);
  });
});

describe("GET /api/me/applications", () => {
  it("lists the student's applications newest first with stable titles", async () => {
    const { session } = await studentSession();
    const a = await openJob({ title: "First job" });
    const b = await openJob({ title: "Second job" });
    await session.post(applyPath(a.job)).send({});
    await session.post(applyPath(b.job)).send({});
    await Job.updateOne({ _id: a.job._id }, { title: "Renamed later" });
    await createApplication({
      jobId: new mongoose.Types.ObjectId(),
      studentId: (await createStudent()).user._id,
    });

    const res = await session.agent.get("/api/me/applications");

    expect(res.status).toBe(200);
    expect(pageOf(res)).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    expect(pageOf(res).items.map((item) => item.job.title)).toEqual(["Second job", "First job"]);
    expect(pageOf(res).items[1]?.job).toMatchObject({
      slug: a.job.slug,
      companyName: "Applied Dynamics",
    });
  });

  it("keeps showing applications whose job is gone, with no slug", async () => {
    const { session, user } = await studentSession();
    const archived = await openJob({ title: "Archived job" });
    const deleted = await openJob({ title: "Deleted job" });
    const suspended = await openJob({ title: "Suspended job" });
    for (const { job } of [archived, deleted, suspended]) {
      await session.post(applyPath(job)).send({});
    }
    await Job.updateOne({ _id: archived.job._id }, { status: "archived" });
    await Job.deleteOne({ _id: deleted.job._id });
    await Company.updateOne({ _id: suspended.company._id }, { verification: "suspended" });
    await Application.updateOne(
      { studentId: user._id, jobId: archived.job._id },
      { status: "closed", closedReason: "job_archived" },
    );

    const items = pageOf(await session.agent.get("/api/me/applications")).items;

    const byTitle = Object.fromEntries(items.map((item) => [item.job.title, item]));
    expect(Object.keys(byTitle).sort()).toEqual(["Archived job", "Deleted job", "Suspended job"]);
    expect(byTitle["Archived job"]).toMatchObject({
      status: "closed",
      closedReason: "job_archived",
    });
    expect(byTitle["Archived job"]?.job.slug).toBeNull();
    expect(byTitle["Deleted job"]?.job.slug).toBeNull();
    expect(byTitle["Suspended job"]?.job.slug).toBeNull();
  });

  it("includes interview details and paginates", async () => {
    const { session, user } = await studentSession();
    const { job } = await openJob();
    const startsAt = new Date("2030-01-01T10:00:00.000Z");
    await createApplication({
      jobId: job._id,
      studentId: user._id,
      status: "interview",
      interview: { startsAt, meetingUrl: "https://meet.example.test/room" },
    });
    for (let i = 0; i < 2; i += 1) {
      await createApplication({ jobId: new mongoose.Types.ObjectId(), studentId: user._id });
    }

    const first = await session.agent.get("/api/me/applications").query({ pageSize: 2 });
    const second = await session.agent.get("/api/me/applications").query({ page: 2, pageSize: 2 });

    expect(pageOf(first).total).toBe(3);
    expect(pageOf(first).items).toHaveLength(2);
    expect(pageOf(second).items).toHaveLength(1);
    const withInterview = [...pageOf(first).items, ...pageOf(second).items].find(
      (item) => item.status === "interview",
    );
    expect(withInterview?.interview).toEqual({
      startsAt: startsAt.toISOString(),
      meetingUrl: "https://meet.example.test/room",
    });
  });

  it("requires a signed-in student", async () => {
    const { email, password } = await createEmployer();
    expect((await request(app).get("/api/me/applications")).status).toBe(401);
    const employer = await signIn(request.agent(app), email, password);
    expect((await employer.agent.get("/api/me/applications")).status).toBe(403);
  });
});

describe("POST /api/applications/:id/withdraw", () => {
  const withdrawPath = (id: mongoose.Types.ObjectId) =>
    `/api/applications/${id.toString()}/withdraw`;

  it("withdraws an applied application and clears the shared scorecard", async () => {
    const { job } = await openJob();
    const { session, user } = await studentSession();
    const attempt = await createAttempt(user._id);
    const application = await createApplication({
      jobId: job._id,
      studentId: user._id,
      sharedAttemptId: attempt._id,
    });

    const res = await session.post(withdrawPath(application._id)).send();

    expect(res.status).toBe(200);
    expect(viewOf(res)).toMatchObject({ status: "withdrawn", hasSharedScorecard: false });
    const stored = await Application.findById(application._id);
    expect(stored?.status).toBe("withdrawn");
    expect(stored?.sharedAttemptId).toBeUndefined();
  });

  it.each(["shortlisted", "interview"] as const)("withdraws from %s", async (status) => {
    const { job } = await openJob();
    const { session, user } = await studentSession();
    const application = await createApplication({ jobId: job._id, studentId: user._id, status });

    const res = await session.post(withdrawPath(application._id)).send();

    expect(viewOf(res).status).toBe("withdrawn");
  });

  it.each(["hired", "rejected", "withdrawn", "closed"] as const)(
    "refuses to withdraw from %s",
    async (status) => {
      const { job } = await openJob();
      const { session, user } = await studentSession();
      const application = await createApplication({ jobId: job._id, studentId: user._id, status });

      const res = await session.post(withdrawPath(application._id)).send();

      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe("invalid_transition");
      expect((await Application.findById(application._id))?.status).toBe(status);
    },
  );

  it("404s for another student's application and changes nothing", async () => {
    const { job } = await openJob();
    const { session } = await studentSession();
    const owner = await createStudent();
    const theirs = await createApplication({ jobId: job._id, studentId: owner.user._id });

    const res = await session.post(withdrawPath(theirs._id)).send();

    expect(res.status).toBe(404);
    expect((await Application.findById(theirs._id))?.status).toBe("applied");
    const missing = await session.post(withdrawPath(new mongoose.Types.ObjectId())).send();
    expect(missing.status).toBe(404);
    expect((await session.post("/api/applications/nope/withdraw").send()).status).toBe(400);
  });

  it("requires a student", async () => {
    const { job, email, password } = await openJob();
    const owner = await createStudent();
    const application = await createApplication({ jobId: job._id, studentId: owner.user._id });
    const employer = await signIn(request.agent(app), email, password);

    expect((await employer.post(withdrawPath(application._id)).send()).status).toBe(403);
  });
});
