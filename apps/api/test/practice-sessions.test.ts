import mongoose from "mongoose";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AttemptSummary, AttemptView, Page, ScenarioPublic } from "@pitchperfect/shared";
import { Application, Company, PracticeAttempt, UsageDay } from "../src/db/models/index.js";
import { csrfAgent } from "./helpers/csrf.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import {
  createApplication,
  createAttempt,
  createStarts,
  createEmployer,
  createJob,
  signIn,
} from "./helpers/factories.js";
import {
  practiceStudent,
  sessionsPath,
  startPractice,
  usePracticeHarness,
} from "./helpers/practice.js";
import { callCount } from "./helpers/stub-coach.js";

useTestDb();
const harness = usePracticeHarness();

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

interface StartBody {
  attemptId: string;
  scenario: ScenarioPublic;
  limits: { maxTurns: number; maxChars: number; expiresAt: string };
}

describe("POST /api/practice/sessions", () => {
  it("plans a scenario and keeps its hidden part on the server", async () => {
    const { session, user } = await practiceStudent(harness.app);
    const before = Date.now();

    const { res, attemptId } = await startPractice(session);

    expect(res.status).toBe(201);
    const body = res.body as StartBody;
    expect(body.scenario).toEqual({
      personaName: expect.any(String) as string,
      personaTitle: expect.any(String) as string,
      companyType: expect.any(String) as string,
      personality: expect.any(String) as string,
      openingLine: expect.any(String) as string,
    });
    expect(body.limits).toMatchObject({ maxTurns: 20, maxChars: 1000 });
    const sessionEnds = Date.parse(body.limits.expiresAt);
    expect(sessionEnds).toBeGreaterThanOrEqual(before + 20 * MINUTE_MS);
    expect(sessionEnds).toBeLessThanOrEqual(Date.now() + 20 * MINUTE_MS);

    const stored = await PracticeAttempt.findById(attemptId).select("+scenarioPrivate").lean();
    expect(stored).toMatchObject({
      studentId: user._id,
      skill: "pitching",
      status: "active",
      stage: "opening",
      provider: "fake",
      guardFlags: 0,
      transcript: [],
      turnLockUntil: null,
    });
    expect(stored?.tokens.input).toBeGreaterThan(0);
    expect(stored?.scenarioPrivate.hiddenObjections.length).toBeGreaterThanOrEqual(2);
    for (const hidden of [
      ...(stored?.scenarioPrivate.hiddenObjections ?? []),
      ...(stored?.scenarioPrivate.winConditions ?? []),
    ]) {
      expect(res.text).not.toContain(hidden);
    }
    expect(res.text).not.toContain("hiddenObjections");
    expect(res.text).not.toContain("winConditions");

    const retention = (stored?.expiresAt.getTime() ?? 0) - (stored?.startedAt.getTime() ?? 0);
    expect(retention).toBe(180 * DAY_MS);

    const usage = await UsageDay.findOne().lean();
    expect(usage).toMatchObject({ sessions: 1, inputTokens: stored?.tokens.input });
    expect(callCount(harness.stub, "/v1/plan")).toBe(1);
  });

  it("sends the student's target role and an active job to the planner", async () => {
    const { session } = await practiceStudent(harness.app);
    const { company } = await createEmployer();
    const job = await createJob(company._id, {
      title: "Inside sales associate",
      descriptionHtml: "<p>Call <strong>warm</strong> leads &amp; book demos.</p>",
      skills: ["prospecting", "demos"],
    });
    const plan = vi.spyOn(harness.coach, "plan");

    const { res, attemptId } = await startPractice(session, {
      skill: "objection-handling",
      jobId: job._id.toString(),
    });

    expect(res.status).toBe(201);
    expect(plan.mock.calls[0]?.[0]).toEqual({
      skill: "objection-handling",
      targetRole: "Sales development rep",
      industry: "Software",
      job: {
        title: "Inside sales associate",
        descriptionText: "Call warm leads & book demos.",
        skills: ["prospecting", "demos"],
      },
    });
    const stored = await PracticeAttempt.findById(attemptId).lean();
    expect(stored?.jobId?.toString()).toBe(job._id.toString());
  });

  it("clips long job descriptions to 4000 characters", async () => {
    const { session } = await practiceStudent(harness.app);
    const { company } = await createEmployer();
    const job = await createJob(company._id, { descriptionHtml: `<p>${"a".repeat(6000)}</p>` });
    const plan = vi.spyOn(harness.coach, "plan");

    await startPractice(session, { skill: "pitching", jobId: job._id.toString() });

    expect(plan.mock.calls[0]?.[0].job?.descriptionText).toHaveLength(4000);
  });

  it("answers 404 for a job that is not listed, without planning", async () => {
    const { session } = await practiceStudent(harness.app);
    const { company } = await createEmployer();
    const draft = await createJob(company._id, { status: "draft" });
    const suspendedEmployer = await createEmployer();
    await Company.updateOne({ _id: suspendedEmployer.company._id }, { verification: "suspended" });
    const hidden = await createJob(suspendedEmployer.company._id);

    for (const job of [draft, hidden]) {
      const { res } = await startPractice(session, {
        skill: "pitching",
        jobId: job._id.toString(),
      });
      expect(res.status).toBe(404);
    }
    expect(callCount(harness.stub, "/v1/plan")).toBe(0);
  });

  it("requires practice consent", async () => {
    const { session } = await practiceStudent(harness.app, { consent: false });
    const { res } = await startPractice(session);
    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("consent_required");
  });

  it("requires a verified email", async () => {
    const { session } = await practiceStudent(harness.app, { verified: false });
    const { res } = await startPractice(session);
    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("email_not_verified");
  });

  it("requires a signed-in student", async () => {
    const anonymous = await csrfAgent(harness.app);
    expect((await anonymous.post(sessionsPath).send({ skill: "pitching" })).status).toBe(401);

    const employer = await createEmployer();
    const session = await signIn(request.agent(harness.app), employer.email, employer.password);
    const res = await session.post(sessionsPath).send({ skill: "pitching" });
    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("forbidden");
  });

  it("rejects an unknown skill or extra fields", async () => {
    const { session } = await practiceStudent(harness.app);
    expect((await startPractice(session, { skill: "juggling" })).res.status).toBe(400);
    const extra = await startPractice(session, { skill: "pitching", persona: "x" });
    expect(extra.res.status).toBe(400);
  });

  it("refuses when today's quota is used, with Retry-After to the next UTC midnight", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-10T18:00:00Z"));
    const { session, user } = await practiceStudent(harness.app);
    await createStarts(user._id, 5);

    const { res } = await startPractice(session);

    expect(res.status).toBe(429);
    expect(errorOf(res).code).toBe("quota_exceeded");
    expect(res.headers["retry-after"]).toBe(String(6 * 60 * 60));
    expect(callCount(harness.stub, "/v1/plan")).toBe(0);
  });

  it("refuses when the global token budget for today is spent", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-10T23:00:00Z"));
    const { session } = await practiceStudent(harness.app);
    await UsageDay.create({ day: "2026-03-10", inputTokens: 1_500_000, outputTokens: 500_000 });

    const { res } = await startPractice(session);

    expect(res.status).toBe(429);
    expect(errorOf(res).code).toBe("budget_exhausted");
    expect(res.headers["retry-after"]).toBe("3600");
    expect(callCount(harness.stub, "/v1/plan")).toBe(0);
  });

  it("abandons the student's other active session", async () => {
    const { session, user } = await practiceStudent(harness.app);
    const first = await startPractice(session);
    await PracticeAttempt.updateOne(
      { _id: first.attemptId },
      { turnLockUntil: new Date(Date.now() + 30_000) },
    );
    const other = await practiceStudent(harness.app);
    const othersSession = await startPractice(other.session);

    const second = await startPractice(session);

    expect(second.res.status).toBe(201);
    const old = await PracticeAttempt.findById(first.attemptId).lean();
    expect(old).toMatchObject({ status: "abandoned", turnLockUntil: null });
    expect(old?.endedAt).toBeInstanceOf(Date);
    const active = await PracticeAttempt.find({ studentId: user._id, status: "active" }).lean();
    expect(active.map((attempt) => attempt._id.toString())).toEqual([second.attemptId]);
    const untouched = await PracticeAttempt.findById(othersSession.attemptId).lean();
    expect(untouched?.status).toBe("active");
  });

  it("leaves the active session alone when the quota refuses a new one", async () => {
    const { session, user } = await practiceStudent(harness.app);
    await createStarts(user._id, 4);
    const current = await startPractice(session);
    expect(current.res.status).toBe(201);

    const { res } = await startPractice(session);

    expect(res.status).toBe(429);
    expect(errorOf(res).code).toBe("quota_exceeded");
    expect((await PracticeAttempt.findById(current.attemptId).lean())?.status).toBe("active");
  });

  it("leaves the active session alone when the budget refuses a new one", async () => {
    const { session } = await practiceStudent(harness.app);
    const current = await startPractice(session);
    const day = new Date().toISOString().slice(0, 10);
    await UsageDay.updateOne({ day }, { $set: { inputTokens: 2_000_000 } });

    const { res } = await startPractice(session);

    expect(errorOf(res).code).toBe("budget_exhausted");
    expect((await PracticeAttempt.findById(current.attemptId).lean())?.status).toBe("active");
  });

  it("leaves no attempt behind when planning fails", async () => {
    const { session, user } = await practiceStudent(harness.app);
    const first = await startPractice(session);
    harness.stub.fail("/v1/plan", { status: 503, code: "practice_unavailable" });

    const { res } = await startPractice(session);

    expect(res.status).toBe(503);
    expect(errorOf(res).code).toBe("practice_unavailable");
    const attempts = await PracticeAttempt.find({ studentId: user._id }).lean();
    expect(attempts.map((attempt) => [attempt._id.toString(), attempt.status])).toEqual([
      [first.attemptId, "abandoned"],
    ]);
    // The abandoned session was planned, so it counts; the failed start does not.
    const quota = await session.agent.get("/api/practice/quota");
    expect((quota.body as { dailyUsed: number }).dailyUsed).toBe(1);
  });

  it("lets only one of many parallel starts through at a time", async () => {
    const { session, user } = await practiceStudent(harness.app);

    const results = await Promise.all(Array.from({ length: 6 }, () => startPractice(session)));

    const statuses = results.map(({ res }) => res.status);
    const started = statuses.filter((status) => status === 201).length;
    expect(started).toBeGreaterThanOrEqual(1);
    expect(started).toBeLessThanOrEqual(5);
    for (const { res } of results) {
      if (res.status !== 201) expect(errorOf(res).code).toMatch(/^(conflict|quota_exceeded)$/);
    }
    const live = await PracticeAttempt.countDocuments({
      studentId: user._id,
      status: mongoose.trusted({ $in: ["starting", "active"] }),
    });
    expect(live).toBe(1);
  });

  it("refuses a second live attempt for the same student at the database", async () => {
    const { user } = await practiceStudent(harness.app);
    await createAttempt(user._id, { status: "active" });

    await expect(createAttempt(user._id, { status: "starting" })).rejects.toMatchObject({
      code: 11000,
    });
    await expect(createAttempt(user._id, { status: "completed" })).resolves.toBeDefined();
  });

  it("answers 409 while another start is planning, and clears a stale one", async () => {
    const { session, user } = await practiceStudent(harness.app);
    const placeholder = await PracticeAttempt.create({
      studentId: user._id,
      skill: "pitching",
      status: "starting",
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + DAY_MS),
    });

    const busy = await startPractice(session);
    expect(busy.res.status).toBe(409);
    expect(errorOf(busy.res).code).toBe("conflict");

    await PracticeAttempt.updateOne(
      { _id: placeholder._id },
      { startedAt: new Date(Date.now() - 2 * MINUTE_MS) },
    );
    const retried = await startPractice(session);
    expect(retried.res.status).toBe(201);
    expect(await PracticeAttempt.findById(placeholder._id)).toBeNull();
    // The refused start gave its session back; only the retried one counts.
    const quota = await session.agent.get("/api/practice/quota");
    expect((quota.body as { dailyUsed: number }).dailyUsed).toBe(1);
  });

  it("hides an attempt that is still being planned", async () => {
    const { session, user } = await practiceStudent(harness.app);
    const placeholder = await PracticeAttempt.create({
      studentId: user._id,
      skill: "pitching",
      status: "starting",
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + DAY_MS),
    });
    const id = placeholder._id.toString();

    expect((await session.agent.get(`${sessionsPath}/${id}`)).status).toBe(404);
    expect((await session.post(`${sessionsPath}/${id}/end`)).status).toBe(404);
    expect((await session.delete(`/api/practice/attempts/${id}`)).status).toBe(404);
    const list = await session.agent.get("/api/practice/attempts");
    expect((list.body as Page<AttemptSummary>).total).toBe(0);
  });

  it("maps other coach failures to 502 upstream_error", async () => {
    const { session } = await practiceStudent(harness.app);
    harness.stub.fail("/v1/plan", { status: 500, code: "internal" });

    const { res } = await startPractice(session);

    expect(res.status).toBe(502);
    expect(errorOf(res).code).toBe("upstream_error");
  });

  it("limits a student to 10 session starts an hour", async () => {
    const { session } = await practiceStudent(harness.app);
    // Starts refused by the daily quota still count against the limiter.
    const statuses: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      statuses.push((await startPractice(session)).res.status);
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429, 429, 429, 429, 429]);

    const { res } = await startPractice(session);
    expect(res.status).toBe(429);
    expect(errorOf(res).code).toBe("rate_limited");
  });
});

describe("GET /api/practice/sessions/:id", () => {
  it("returns the owner's attempt without the hidden scenario", async () => {
    const { session } = await practiceStudent(harness.app);
    const { attemptId } = await startPractice(session);

    const res = await session.agent.get(`${sessionsPath}/${attemptId}`);

    expect(res.status).toBe(200);
    const { attempt } = res.body as { attempt: AttemptView };
    expect(attempt).toMatchObject({
      id: attemptId,
      status: "active",
      stage: "opening",
      scorecard: null,
    });
    expect(res.text).not.toContain("hiddenObjections");
  });

  it("answers 404 for another student's attempt and 400 for a malformed id", async () => {
    const owner = await practiceStudent(harness.app);
    const { attemptId } = await startPractice(owner.session);
    const { session } = await practiceStudent(harness.app);

    expect((await session.agent.get(`${sessionsPath}/${attemptId}`)).status).toBe(404);
    expect((await session.agent.get(`${sessionsPath}/not-an-id`)).status).toBe(400);
  });
});

describe("GET /api/practice/attempts", () => {
  it("lists the student's own attempts, newest first, filtered by skill", async () => {
    const { session, user } = await practiceStudent(harness.app);
    const older = await createAttempt(user._id, { startedAt: new Date(Date.now() - DAY_MS) });
    const newer = await createAttempt(user._id, { skill: "next-steps" });
    const other = await practiceStudent(harness.app);
    await createAttempt(other.user._id);

    const all = await session.agent.get("/api/practice/attempts");
    expect(all.status).toBe(200);
    const page = all.body as Page<AttemptSummary>;
    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.id)).toEqual([newer.id, older.id]);

    const filtered = await session.agent.get("/api/practice/attempts?skill=next-steps");
    expect((filtered.body as Page<AttemptSummary>).items.map((item) => item.id)).toEqual([
      newer.id,
    ]);
    expect((await session.agent.get("/api/practice/attempts?skill=nope")).status).toBe(400);
  });
});

describe("DELETE /api/practice/attempts/:id", () => {
  it("deletes the attempt and unshares it from applications", async () => {
    const { session, user } = await practiceStudent(harness.app);
    const attempt = await createAttempt(user._id);
    const { company } = await createEmployer();
    const job = await createJob(company._id);
    const application = await createApplication({
      jobId: job._id,
      studentId: user._id,
      sharedAttemptId: attempt._id,
    });

    const res = await session.delete(`/api/practice/attempts/${attempt.id}`);

    expect(res.status).toBe(204);
    expect(await PracticeAttempt.findById(attempt._id)).toBeNull();
    const stored = await Application.findById(application._id).lean();
    expect(stored?.sharedAttemptId).toBeUndefined();
  });

  it("answers 404 for another student's attempt", async () => {
    const owner = await practiceStudent(harness.app);
    const attempt = await createAttempt(owner.user._id);
    const { session } = await practiceStudent(harness.app);

    expect((await session.delete(`/api/practice/attempts/${attempt.id}`)).status).toBe(404);
    expect(await PracticeAttempt.findById(attempt._id)).not.toBeNull();
  });
});
