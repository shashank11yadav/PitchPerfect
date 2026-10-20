import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PracticeQuota } from "@pitchperfect/shared";
import { PracticeAttempt, UsageDay } from "../src/db/models/index.js";
import { csrfAgent } from "./helpers/csrf.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import { createAttempt, createEmployer, signIn } from "./helpers/factories.js";
import {
  practiceStudent,
  sendTurnAndLeave,
  startPractice,
  usePracticeHarness,
} from "./helpers/practice.js";

useTestDb();
const harness = usePracticeHarness();

const QUOTA_PATH = "/api/practice/quota";
const NOW = new Date("2026-03-10T15:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

async function quotaOf(session: Awaited<ReturnType<typeof practiceStudent>>["session"]) {
  const res = await session.agent.get(QUOTA_PATH);
  expect(res.status).toBe(200);
  return res.body as PracticeQuota;
}

const studentEntry = { role: "student" as const, text: "Hello", at: NOW, flagged: false };

describe("GET /api/practice/quota", () => {
  it("reports an unused quota that resets at the next UTC midnight", async () => {
    const { session } = await practiceStudent(harness.app);

    expect(await quotaOf(session)).toEqual({
      dailyUsed: 0,
      dailyLimit: 5,
      monthlyUsed: 0,
      monthlyLimit: 30,
      available: true,
      budgetExhausted: false,
      resetsAt: "2026-03-11T00:00:00.000Z",
    });
  });

  it("is unavailable while today's global token budget is spent, and says so", async () => {
    const { session } = await practiceStudent(harness.app);
    await UsageDay.create({ day: "2026-03-10", inputTokens: 1_500_000, outputTokens: 499_999 });
    expect(await quotaOf(session)).toMatchObject({ available: true, budgetExhausted: false });

    await UsageDay.updateOne({ day: "2026-03-10" }, { $inc: { outputTokens: 1 } });
    expect(await quotaOf(session)).toMatchObject({
      dailyUsed: 0,
      available: false,
      budgetExhausted: true,
    });

    // Yesterday's spending doesn't count against today.
    vi.setSystemTime(new Date("2026-03-11T00:01:00Z"));
    expect(await quotaOf(session)).toMatchObject({ available: true, budgetExhausted: false });
  });

  it("counts every planned session this UTC day and month, turns or not", async () => {
    const { session, user } = await practiceStudent(harness.app);
    const other = await practiceStudent(harness.app);
    await createAttempt(user._id);
    await createAttempt(user._id, { status: "active" });
    await createAttempt(user._id, { status: "abandoned", transcript: [studentEntry] });
    await createAttempt(user._id, { status: "abandoned" });
    await createAttempt(user._id, { startedAt: new Date("2026-03-09T23:59:59Z") });
    await createAttempt(user._id, { startedAt: new Date("2026-02-28T12:00:00Z") });
    await createAttempt(other.user._id);

    expect(await quotaOf(session)).toMatchObject({ dailyUsed: 4, monthlyUsed: 5, available: true });
  });

  it("counts a start that is still planning, but not one that crashed", async () => {
    const { session, user } = await practiceStudent(harness.app);
    const placeholder = await PracticeAttempt.create({
      studentId: user._id,
      skill: "pitching",
      status: "starting",
      startedAt: new Date(NOW.getTime() - 2 * 60 * 1000),
      expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    });
    expect(await quotaOf(session)).toMatchObject({ dailyUsed: 0 });

    await PracticeAttempt.updateOne({ _id: placeholder._id }, { startedAt: NOW });
    expect(await quotaOf(session)).toMatchObject({ dailyUsed: 1 });
  });

  it("refuses the sixth start of the day even when no session had a turn", async () => {
    const { session } = await practiceStudent(harness.app);
    for (let index = 0; index < 5; index += 1) {
      expect((await startPractice(session)).res.status).toBe(201);
    }

    const { res } = await startPractice(session);

    expect(res.status).toBe(429);
    expect(errorOf(res).code).toBe("quota_exceeded");
    expect(await quotaOf(session)).toMatchObject({ dailyUsed: 5, available: false });
  });

  it("counts a session whose only turn was cut off", async () => {
    const { session } = await practiceStudent(harness.app);
    const { attemptId } = await startPractice(session);
    harness.coach.interrupt = "stall";
    await sendTurnAndLeave(session, attemptId, "Hello there");
    await vi.waitFor(async () => {
      expect((await PracticeAttempt.findById(attemptId).lean())?.turnLockUntil).toBeNull();
    });
    harness.coach.interrupt = null;

    await startPractice(session);

    expect((await PracticeAttempt.findById(attemptId).lean())?.status).toBe("abandoned");
    expect(await quotaOf(session)).toMatchObject({ dailyUsed: 2 });
  });

  it("is unavailable once the daily or monthly limit is reached", async () => {
    const daily = await practiceStudent(harness.app);
    for (let index = 0; index < 5; index += 1) await createAttempt(daily.user._id);
    expect(await quotaOf(daily.session)).toMatchObject({ dailyUsed: 5, available: false });

    const monthly = await practiceStudent(harness.app);
    for (let index = 0; index < 30; index += 1) {
      await createAttempt(monthly.user._id, { startedAt: new Date("2026-03-02T10:00:00Z") });
    }
    expect(await quotaOf(monthly.session)).toMatchObject({
      dailyUsed: 0,
      monthlyUsed: 30,
      available: false,
    });
    const { res } = await startPractice(monthly.session);
    expect(res.status).toBe(429);
    expect(errorOf(res).code).toBe("quota_exceeded");
    // Until the first of next month.
    expect(res.headers["retry-after"]).toBe(String(21 * 24 * 60 * 60 + 9 * 60 * 60));
  });

  it("resets at UTC midnight", async () => {
    vi.setSystemTime(new Date("2026-03-10T23:59:00Z"));
    const { session, user } = await practiceStudent(harness.app);
    for (let index = 0; index < 5; index += 1) await createAttempt(user._id);

    const blocked = await startPractice(session);
    expect(blocked.res.status).toBe(429);
    expect(blocked.res.headers["retry-after"]).toBe("60");

    vi.setSystemTime(new Date("2026-03-11T00:01:00Z"));
    expect(await quotaOf(session)).toMatchObject({
      dailyUsed: 0,
      monthlyUsed: 5,
      available: true,
      resetsAt: "2026-03-12T00:00:00.000Z",
    });
    expect((await startPractice(session)).res.status).toBe(201);
  });

  it("requires a signed-in student", async () => {
    const anonymous = await csrfAgent(harness.app);
    expect((await anonymous.agent.get(QUOTA_PATH)).status).toBe(401);

    const employer = await createEmployer();
    const session = await signIn(request.agent(harness.app), employer.email, employer.password);
    expect((await session.agent.get(QUOTA_PATH)).status).toBe(403);
  });
});
