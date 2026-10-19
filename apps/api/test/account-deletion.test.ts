import mongoose from "mongoose";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  Application,
  AuthToken,
  Company,
  EmployerProfile,
  Job,
  PracticeAttempt,
  SavedJob,
  StudentProfile,
  User,
} from "../src/db/models/index.js";
import { createToken } from "../src/services/tokens.js";
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
import { tinyPdf } from "./helpers/pdf.js";

useTestDb();

const { app, mailer } = makeTestApp();

afterEach(() => {
  mailer.sent.length = 0;
});

const files = () => mongoose.connection.collection("resumes.files");
const chunks = () => mongoose.connection.collection("resumes.chunks");
const HOUR_MS = 60 * 60 * 1000;

describe("DELETE /api/me as a student", () => {
  async function studentWithEverything() {
    const account = await createStudent();
    const { company } = await createEmployer({ email: "boss@example.test" });
    const job = await createJob(company._id);
    const session = await signIn(request.agent(app), account.email, account.password);
    await session.put("/api/me/resume").attach("file", tinyPdf(), "cv.pdf").expect(200);
    const attempt = await createAttempt(account.user._id);
    await createAttempt(account.user._id);
    await createApplication({
      jobId: job._id,
      studentId: account.user._id,
      sharedAttemptId: attempt._id,
    });
    await SavedJob.create({ studentId: account.user._id, jobId: job._id });
    await createToken(account.user.id, "verify_email", HOUR_MS);
    await createToken(account.user.id, "reset_password", HOUR_MS);
    return { ...account, session, job };
  }

  it("removes every related document and the résumé file", async () => {
    const { user, password, session } = await studentWithEverything();

    const res = await session.delete("/api/me").send({ currentPassword: password });

    expect(res.status).toBe(204);
    expect(await User.countDocuments({ _id: user._id })).toBe(0);
    expect(await StudentProfile.countDocuments({ userId: user._id })).toBe(0);
    expect(await PracticeAttempt.countDocuments({ studentId: user._id })).toBe(0);
    expect(await Application.countDocuments({ studentId: user._id })).toBe(0);
    expect(await SavedJob.countDocuments({ studentId: user._id })).toBe(0);
    expect(await AuthToken.countDocuments({ userId: user._id })).toBe(0);
    expect(await files().countDocuments()).toBe(0);
    expect(await chunks().countDocuments()).toBe(0);
  });

  it("leaves other people's data alone", async () => {
    const { password, session, job } = await studentWithEverything();
    const other = await createStudent();
    await createApplication({ jobId: job._id, studentId: other.user._id });
    await createAttempt(other.user._id);

    await session.delete("/api/me").send({ currentPassword: password }).expect(204);

    expect(await Application.countDocuments({ studentId: other.user._id })).toBe(1);
    expect(await PracticeAttempt.countDocuments({ studentId: other.user._id })).toBe(1);
    expect(await Job.countDocuments({ _id: job._id })).toBe(1);
    expect(await User.countDocuments({ _id: other.user._id })).toBe(1);
  });

  it("signs out everywhere and clears the cookie", async () => {
    const { email, password, session } = await studentWithEverything();
    const second = await signIn(request.agent(app), email, password);

    const res = await session.delete("/api/me").send({ currentPassword: password });

    expect(res.headers["set-cookie"]).toEqual(
      expect.arrayContaining([expect.stringMatching(/^pp\.sid=;/)]),
    );
    await session.agent.get("/api/auth/me").expect(401);
    await second.agent.get("/api/auth/me").expect(401);
    expect(await mongoose.connection.collection("sessions").countDocuments()).toBe(0);
  });

  it("needs the correct current password and deletes nothing otherwise", async () => {
    const { user, session } = await studentWithEverything();

    expect((await session.delete("/api/me").send({})).status).toBe(400);
    const wrong = await session.delete("/api/me").send({ currentPassword: "not-my-password-1" });

    expect(wrong.status).toBe(401);
    expect(errorOf(wrong).code).toBe("invalid_credentials");
    expect(await User.countDocuments({ _id: user._id })).toBe(1);
    expect(await files().countDocuments()).toBe(1);
    expect(await PracticeAttempt.countDocuments({ studentId: user._id })).toBe(2);
  });

  it("requires a session and counts attempts per user", async () => {
    expect(
      (await (await csrfAgent(app)).delete("/api/me").send({ currentPassword: "x" })).status,
    ).toBe(401);

    const { session } = await studentWithEverything();
    for (let i = 0; i < 5; i += 1) {
      await session.delete("/api/me").send({ currentPassword: "not-my-password-1" }).expect(401);
    }
    expect(
      (await session.delete("/api/me").send({ currentPassword: "not-my-password-1" })).status,
    ).toBe(429);
  });
});

describe("DELETE /api/me as an employer", () => {
  async function employerWithApplicants() {
    const account = await createEmployer({ companyName: "Acme Demo Co" });
    const jobA = await createJob(account.company._id, "Account executive");
    const jobB = await createJob(account.company._id, "Sales intern");
    const snapshotOf = (job: { title: string }) => ({
      jobSnapshot: { title: job.title, companyName: "Acme Demo Co" },
    });
    const alice = await createStudent({ email: "alice@example.test" });
    const bob = await createStudent({ email: "bob@example.test" });
    const carol = await createStudent({ email: "carol@example.test" });
    const open = await createApplication({
      jobId: jobA._id,
      ...snapshotOf(jobA),
      studentId: alice.user._id,
      status: "interview",
      interview: {
        startsAt: new Date(Date.now() + 86_400_000),
        meetingUrl: "https://meet.example.test/x",
      },
    });
    const applied = await createApplication({
      jobId: jobB._id,
      ...snapshotOf(jobB),
      studentId: bob.user._id,
    });
    // Alice also has an open application to the second job.
    const second = await createApplication({
      jobId: jobB._id,
      ...snapshotOf(jobB),
      studentId: alice.user._id,
    });
    // Written before snapshots existed: no `jobSnapshot`.
    const dave = await createStudent({ email: "dave@example.test" });
    const legacyId = new mongoose.Types.ObjectId();
    await Application.collection.insertOne({
      _id: legacyId,
      jobId: jobB._id,
      studentId: dave.user._id,
      status: "hired",
      savedByEmployer: false,
    });
    const rejected = await createApplication({
      jobId: jobA._id,
      ...snapshotOf(jobA),
      studentId: carol.user._id,
      status: "rejected",
    });
    await SavedJob.create({ studentId: alice.user._id, jobId: jobA._id });
    const session = await signIn(request.agent(app), account.email, account.password);
    return {
      ...account,
      session,
      jobA,
      jobB,
      alice,
      bob,
      carol,
      open,
      applied,
      second,
      rejected,
      legacyId,
    };
  }

  it("removes the company, jobs, profile, and user", async () => {
    const { user, company, session, password } = await employerWithApplicants();
    await createToken(user.id, "reset_password", HOUR_MS);

    const res = await session.delete("/api/me").send({ currentPassword: password });

    expect(res.status).toBe(204);
    expect(await User.countDocuments({ _id: user._id })).toBe(0);
    expect(await EmployerProfile.countDocuments({ userId: user._id })).toBe(0);
    expect(await Company.countDocuments({ _id: company._id })).toBe(0);
    expect(await Job.countDocuments({ companyId: company._id })).toBe(0);
    expect(await AuthToken.countDocuments({ userId: user._id })).toBe(0);
    expect(await SavedJob.countDocuments()).toBe(0);
    await session.agent.get("/api/auth/me").expect(401);
  });

  it("closes open applications, drops interviews, and keeps closed ones displayable", async () => {
    const { session, password, open, applied, second, rejected, legacyId } =
      await employerWithApplicants();

    await session.delete("/api/me").send({ currentPassword: password }).expect(204);

    const after = async (id: mongoose.Types.ObjectId) => Application.findById(id).lean();
    for (const application of [open, applied, second]) {
      expect((await after(application._id))?.status).toBe("closed");
      expect((await after(application._id))?.closedReason).toBe("employer_left");
    }
    expect((await after(open._id))?.interview).toBeUndefined();
    expect((await after(rejected._id))?.status).toBe("rejected");
    expect((await after(rejected._id))?.closedReason).toBeNull();
    expect((await after(legacyId))?.status).toBe("hired");
    expect((await after(legacyId))?.closedReason ?? null).toBeNull();
  });

  it("leaves every application of the company with a job snapshot", async () => {
    const { session, password, jobA, jobB } = await employerWithApplicants();

    await session.delete("/api/me").send({ currentPassword: password }).expect(204);

    const applications = await Application.find().lean();
    expect(applications).toHaveLength(5);
    const titleOf = new Map([
      [jobA._id.toString(), "Account executive"],
      [jobB._id.toString(), "Sales intern"],
    ]);
    for (const application of applications) {
      expect(application.jobSnapshot).toEqual({
        title: titleOf.get(application.jobId.toString()),
        companyName: "Acme Demo Co",
      });
    }
  });

  it("emails each affected student once, naming every job that closed", async () => {
    const { session, password, alice, bob, carol } = await employerWithApplicants();

    await session.delete("/api/me").send({ currentPassword: password }).expect(204);

    const recipients = mailer.sent.map((message) => message.to).sort();
    expect(recipients).toEqual([alice.email, bob.email].sort());
    expect(recipients).not.toContain(carol.email);
    const toAlice = mailer.sent.find((message) => message.to === alice.email);
    expect(toAlice?.subject).toContain("Account executive");
    expect(toAlice?.subject).toContain("Sales intern");
    expect(toAlice?.text).toContain("Acme Demo Co");
    const toBob = mailer.sent.find((message) => message.to === bob.email);
    expect(toBob?.text).toContain("Sales intern");
    expect(toBob?.text).not.toContain("Account executive");
  });

  it("still deletes when an email can't be sent", async () => {
    const { session, password, user } = await employerWithApplicants();
    mailer.failing = true;
    try {
      await session.delete("/api/me").send({ currentPassword: password }).expect(204);
    } finally {
      mailer.failing = false;
    }
    expect(await User.countDocuments({ _id: user._id })).toBe(0);
  });

  it("does not touch other employers' companies or jobs", async () => {
    const { session, password } = await employerWithApplicants();
    const other = await createEmployer({ companyName: "Other Demo Co" });
    const otherJob = await createJob(other.company._id);
    const student = await createStudent();
    await createApplication({ jobId: otherJob._id, studentId: student.user._id });

    await session.delete("/api/me").send({ currentPassword: password }).expect(204);

    expect(await Company.countDocuments({ _id: other.company._id })).toBe(1);
    expect(await Job.countDocuments({ _id: otherJob._id })).toBe(1);
    expect((await Application.findOne({ jobId: otherJob._id }))?.status).toBe("applied");
  });
});
