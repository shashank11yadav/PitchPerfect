import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PracticeQuota } from "@pitchperfect/shared";
import { PracticeAttempt, UsageDay } from "../src/db/models/index.js";
import { QuotaExceededError } from "../src/errors.js";
import { getQuota, reserveStart } from "../src/modules/practice/quota.js";
import { csrfAgent } from "./helpers/csrf.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import { createEmployer, createStarts, signIn } from "./helpers/factories.js";
import {
  deferred,
  practiceStudent,
  sendTurnAndLeave,
  sendTurns,
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
      tokenLimitReached: false,
      resetsAt: "2026-03-11T00:00:00.000Z",
      // The test coach runs the fake provider, so the partner is the scripted one.
      practicePartner: "scripted",
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

  it("counts every session started this UTC day and month, turns or not", async () => {
    const { session, user } = await practiceStudent(harness.app);
    const other = await practiceStudent(harness.app);
    await createStarts(user._id, 1, new Date("2026-03-09T23:59:59Z"));
    await createStarts(user._id, 1, new Date("2026-02-28T12:00:00Z"));
    await createStarts(other.user._id, 1);
    const { attemptId } = await startPractice(session);
    await sendTurns(session, attemptId, 1);
    for (let index = 0; index < 3; index += 1) await startPractice(session);

    expect(await quotaOf(session)).toMatchObject({ dailyUsed: 4, monthlyUsed: 5, available: true });
  });

  it("counts a start while it is still planning", async () => {
    const { session } = await practiceStudent(harness.app);
    const plan = harness.coach.plan.bind(harness.coach);
    const planning = deferred();
    const spy = vi
      .spyOn(harness.coach, "plan")
      .mockImplementationOnce((...args) => planning.promise.then(() => plan(...args)));

    const started = startPractice(session);
    await vi.waitFor(async () => {
      expect(await quotaOf(session)).toMatchObject({ dailyUsed: 1 });
    });
    planning.resolve();

    expect((await started).res.status).toBe(201);
    expect(await quotaOf(session)).toMatchObject({ dailyUsed: 1 });
    spy.mockRestore();
  });

  it("gives back a start that crashed before its plan finished", async () => {
    const { session, user } = await practiceStudent(harness.app);
    // What a crash mid-plan leaves behind: the counted start and its placeholder.
    const startedAt = new Date(NOW.getTime() - 2 * 60 * 1000);
    await createStarts(user._id, 1, startedAt);
    const placeholder = await PracticeAttempt.create({
      studentId: user._id,
      skill: "pitching",
      status: "starting",
      startedAt,
      expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    });

    expect((await startPractice(session)).res.status).toBe(201);

    expect(await PracticeAttempt.findById(placeholder._id)).toBeNull();
    expect(await quotaOf(session)).toMatchObject({ dailyUsed: 1 });
  });

  it("gives back the session when planning fails, so it can be used again", async () => {
    const { session, user } = await practiceStudent(harness.app);
    await createStarts(user._id, 4);
    harness.stub.fail("/v1/plan", { status: 503, code: "practice_unavailable" });

    expect((await startPractice(session)).res.status).toBe(503);
    expect(await quotaOf(session)).toMatchObject({ dailyUsed: 4, available: true });

    harness.stub.clear();
    expect((await startPractice(session)).res.status).toBe(201);
    expect(await quotaOf(session)).toMatchObject({ dailyUsed: 5, available: false });
  });

  it("does not count a start the global budget refused", async () => {
    const { session } = await practiceStudent(harness.app);
    await UsageDay.create({ day: "2026-03-10", inputTokens: 2_000_000 });

    expect(errorOf((await startPractice(session)).res).code).toBe("budget_exhausted");
    expect(await quotaOf(session)).toMatchObject({ dailyUsed: 0, monthlyUsed: 0 });
  });

  it("never counts more starts than the limits, however many arrive at once", async () => {
    const { user } = await practiceStudent(harness.app);
    const config = {
      PRACTICE_DAILY_LIMIT: 5,
      PRACTICE_MONTHLY_LIMIT: 30,
      PRACTICE_DAILY_TOKEN_BUDGET: 2_000_000,
      PRACTICE_STUDENT_DAILY_TOKEN_LIMIT: 250_000,
    };

    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => reserveStart(config, user.id, NOW)),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(5);
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason).toBeInstanceOf(QuotaExceededError);
    }
    expect(await getQuota(config, user.id, NOW)).toMatchObject({ dailyUsed: 5, monthlyUsed: 5 });

    const monthly = await practiceStudent(harness.app);
    await createStarts(monthly.user._id, 28, new Date("2026-03-02T10:00:00Z"));
    const lastTwo = await Promise.allSettled(
      Array.from({ length: 12 }, () => reserveStart(config, monthly.user.id, NOW)),
    );
    expect(lastTwo.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    expect(await getQuota(config, monthly.user.id, NOW)).toMatchObject({ monthlyUsed: 30 });
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

  it("still counts sessions the student deleted", async () => {
    const { session } = await practiceStudent(harness.app);
    const started: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const { res, attemptId } = await startPractice(session);
      expect(res.status).toBe(201);
      started.push(attemptId);
    }
    expect((await startPractice(session)).res.status).toBe(429);

    for (const attemptId of started.slice(0, 4)) {
      expect((await session.delete(`/api/practice/attempts/${attemptId}`)).status).toBe(204);
    }

    expect(await quotaOf(session)).toMatchObject({
      dailyUsed: 5,
      monthlyUsed: 5,
      available: false,
    });
    const { res } = await startPractice(session);
    expect(res.status).toBe(429);
    expect(errorOf(res).code).toBe("quota_exceeded");
  });

  it("lets two overlapping starts use only the last free session", async () => {
    const { session } = await practiceStudent(harness.app);
    for (let index = 0; index < 4; index += 1) {
      expect((await startPractice(session)).res.status).toBe(201);
    }
    // Hold the first start between its quota check and its claim while a second start runs.
    const abandon = PracticeAttempt.updateMany.bind(PracticeAttempt);
    const held = deferred();
    const holding = deferred();
    const spy = vi.spyOn(PracticeAttempt, "updateMany");
    spy.mockImplementationOnce(((...args: Parameters<typeof abandon>) => {
      holding.resolve();
      return held.promise.then(() => abandon(...args));
    }) as unknown as typeof abandon);

    const first = startPractice(session);
    await holding.promise;
    const second = await startPractice(session);
    held.resolve();
    const results = [(await first).res, second.res];
    spy.mockRestore();

    expect(results.filter((res) => res.status === 201)).toHaveLength(1);
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
    await createStarts(daily.user._id, 5);
    expect(await quotaOf(daily.session)).toMatchObject({ dailyUsed: 5, available: false });

    const monthly = await practiceStudent(harness.app);
    await createStarts(monthly.user._id, 30, new Date("2026-03-02T10:00:00Z"));
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
    await createStarts(user._id, 5);

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
