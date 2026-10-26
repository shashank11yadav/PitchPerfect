import type { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIMITS, type CoachTurnEvent, type PracticeQuota } from "@pitchperfect/shared";
import { PracticeAttempt, PracticeStart, UsageDay } from "../src/db/models/index.js";
import { TokenLimitError, UpstreamError } from "../src/errors.js";
import { recordUsage, reserveStart } from "../src/modules/practice/quota.js";
import type { CsrfAgent } from "./helpers/csrf.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import { createTokenUse } from "./helpers/factories.js";
import {
  practiceStudent,
  sendTurn,
  sendTurns,
  sessionsPath,
  startPractice,
  usePracticeHarness,
} from "./helpers/practice.js";
import { callCount } from "./helpers/stub-coach.js";

useTestDb();
const LIMIT = 50_000;
const harness = usePracticeHarness({ env: { PRACTICE_STUDENT_DAILY_TOKEN_LIMIT: String(LIMIT) } });

const NOW = new Date("2026-03-10T15:00:00Z");
const DAY = "2026-03-10";
const CONFIG = {
  PRACTICE_DAILY_LIMIT: 5,
  PRACTICE_MONTHLY_LIMIT: 30,
  PRACTICE_DAILY_TOKEN_BUDGET: 2_000_000,
  PRACTICE_STUDENT_DAILY_TOKEN_LIMIT: LIMIT,
};
/** Instructions each model call carries besides the request, in the api's estimates. */
const PROMPT_TOKENS = 1500;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Today's global usage. */
async function today() {
  const row = await UsageDay.findOne({ day: DAY }).lean();
  return { input: row?.inputTokens ?? 0, output: row?.outputTokens ?? 0 };
}

/** The student's own tokens today, from their ledger. */
async function studentTokens(studentId: Types.ObjectId) {
  const row = await PracticeStart.findOne({ studentId, month: DAY.slice(0, 7) });
  return row?.tokens.get(DAY) ?? 0;
}

async function quotaOf(session: CsrfAgent) {
  return (await session.agent.get("/api/practice/quota")).body as PracticeQuota;
}

const requestTokens = (request: object | undefined) =>
  Math.ceil(JSON.stringify(request).length / 4);

describe("tokens a failed coach call used", () => {
  it("charges a failed plan what the coach reported, and gives the session back", async () => {
    const { session, user } = await practiceStudent(harness.app);
    const usage = { inputTokens: 900, outputTokens: 1200 };
    harness.stub.fail("/v1/plan", { status: 502, code: "upstream_error", usage });

    const { res } = await startPractice(session);

    expect(res.status).toBe(502);
    expect(await today()).toEqual({ input: 900, output: 1200 });
    expect(await studentTokens(user._id)).toBe(2100);
    expect(await quotaOf(session)).toMatchObject({ dailyUsed: 0 });
  });

  it("estimates a plan the coach never answered", async () => {
    const { session, user } = await practiceStudent(harness.app);
    // What the client gives when the coach times out or the connection drops.
    const plan = vi.spyOn(harness.coach, "plan").mockRejectedValueOnce(new UpstreamError());

    expect((await startPractice(session)).res.status).toBe(502);

    const input = requestTokens(plan.mock.calls[0]?.[0]) + PROMPT_TOKENS;
    expect(await today()).toEqual({ input, output: LIMITS.maxTokensPlan });
    expect(await studentTokens(user._id)).toBe(input + LIMITS.maxTokensPlan);
  });

  it("charges nothing for a plan the coach turned away", async () => {
    const { session, user } = await practiceStudent(harness.app);
    harness.stub.fail("/v1/plan", { status: 503, code: "practice_unavailable" });

    expect((await startPractice(session)).res.status).toBe(503);

    expect(await today()).toEqual({ input: 0, output: 0 });
    expect(await studentTokens(user._id)).toBe(0);
  });

  it("charges a failed score what the coach reported, to the attempt too", async () => {
    const { session, user } = await practiceStudent(harness.app);
    const { attemptId } = await startPractice(session);
    await sendTurns(session, attemptId, 2);
    const [before, attemptBefore] = [await today(), await PracticeAttempt.findById(attemptId)];
    harness.stub.fail("/v1/score", {
      status: 502,
      code: "upstream_error",
      usage: { inputTokens: 3000, outputTokens: 2400 },
    });

    expect((await session.post(`${sessionsPath}/${attemptId}/end`)).status).toBe(502);

    expect(await today()).toEqual({ input: before.input + 3000, output: before.output + 2400 });
    const stored = await PracticeAttempt.findById(attemptId).lean();
    expect(stored?.status).toBe("active");
    expect(stored?.tokens.input).toBe((attemptBefore?.tokens.input ?? 0) + 3000);
    const after = await today();
    expect(await studentTokens(user._id)).toBe(after.input + after.output);
  });

  it("estimates a score the coach never answered", async () => {
    const { session } = await practiceStudent(harness.app);
    const { attemptId } = await startPractice(session);
    await sendTurns(session, attemptId, 2);
    const before = await today();
    const score = vi.spyOn(harness.coach, "score").mockRejectedValueOnce(new UpstreamError());

    expect((await session.post(`${sessionsPath}/${attemptId}/end`)).status).toBe(502);

    expect(await today()).toEqual({
      input: before.input + requestTokens(score.mock.calls[0]?.[0]) + PROMPT_TOKENS,
      output: before.output + LIMITS.maxTokensScore,
    });
  });

  it("charges a turn's error event what the coach reported", async () => {
    const { session, user } = await practiceStudent(harness.app);
    const { attemptId } = await startPractice(session);
    const before = await today();
    const usage = {
      provider: "openai" as const,
      model: "test-model",
      inputTokens: 1800,
      outputTokens: 450,
    };
    vi.spyOn(harness.coach, "turn").mockImplementationOnce(async function* () {
      await Promise.resolve();
      yield { type: "delta", text: "Sure." } satisfies CoachTurnEvent;
      yield { type: "error", code: "upstream_error", usage } satisfies CoachTurnEvent;
    });

    const { events } = await sendTurn(session, attemptId, "Hello there");

    expect(events.map((event) => event.event)).toEqual(["delta", "error"]);
    expect(await today()).toEqual({ input: before.input + 1800, output: before.output + 450 });
    const stored = await PracticeAttempt.findById(attemptId).lean();
    expect(stored?.transcript).toMatchObject([{ role: "student", flagged: true }]);
    const after = await today();
    expect(await studentTokens(user._id)).toBe(after.input + after.output);
  });
});

describe("today's global token budget", () => {
  it("refuses a turn once it is spent, and the session can still be ended and scored", async () => {
    const { session } = await practiceStudent(harness.app);
    const { attemptId } = await startPractice(session);
    await sendTurns(session, attemptId, 2);
    await UsageDay.updateOne(
      { day: DAY },
      { $set: { inputTokens: CONFIG.PRACTICE_DAILY_TOKEN_BUDGET, outputTokens: 0 } },
    );
    const turnsBefore = callCount(harness.stub, "/v1/turn");

    const { res } = await sendTurn(session, attemptId, "One more question about routing?");

    expect(res.status).toBe(429);
    expect(errorOf(res)).toMatchObject({
      code: "budget_exhausted",
      message: "Practice is at capacity for today. End the session to get your scorecard",
    });
    expect(res.headers["retry-after"]).toBe(String(9 * 60 * 60));
    expect(callCount(harness.stub, "/v1/turn")).toBe(turnsBefore);
    const stored = await PracticeAttempt.findById(attemptId).lean();
    expect(stored).toMatchObject({ status: "active", turnLockUntil: null });
    expect(stored?.transcript.filter((entry) => entry.role === "student")).toHaveLength(2);

    const ended = await session.post(`${sessionsPath}/${attemptId}/end`);
    expect(ended.status).toBe(200);
    expect((ended.body as { attempt: { status: string } }).attempt.status).toBe("completed");
  });
});

describe("support turns", () => {
  it("charges what a support turn used to the student, without keeping the turn", async () => {
    const { session, user } = await practiceStudent(harness.app);
    const { attemptId } = await startPractice(session);
    const before = await today();
    const ownBefore = await studentTokens(user._id);
    // What a live model guard costs before it returns `self_harm` for a line the rules miss.
    const usage = { provider: "openai" as const, model: "test-model", inputTokens: 600 };
    vi.spyOn(harness.coach, "turn").mockImplementationOnce(async function* () {
      await Promise.resolve();
      yield {
        type: "support",
        text: "This is PitchPerfect, stepping out of the practice call.",
        usage: { ...usage, outputTokens: 20 },
      } satisfies CoachTurnEvent;
    });

    const { events } = await sendTurn(session, attemptId, "Lately none of this feels worth it.");

    expect(events.map((event) => event.event)).toEqual(["support"]);
    expect(await today()).toEqual({ input: before.input + 600, output: before.output + 20 });
    expect(await studentTokens(user._id)).toBe(ownBefore + 620);
    expect((await PracticeAttempt.findById(attemptId).lean())?.transcript).toEqual([]);
  });
});

describe("the student's daily token cap", () => {
  it("counts every coach call against the student as well as the global budget", async () => {
    const { session, user } = await practiceStudent(harness.app);
    const other = await practiceStudent(harness.app);
    const { attemptId } = await startPractice(session);
    await sendTurns(session, attemptId, 2);
    await session.post(`${sessionsPath}/${attemptId}/end`);
    await startPractice(other.session);

    const own = await studentTokens(user._id);
    const total = await today();
    expect(own).toBeGreaterThan(0);
    expect(own + (await studentTokens(other.user._id))).toBe(total.input + total.output);
  });

  it("says so on the quota once the student has used today's tokens", async () => {
    const { session, user } = await practiceStudent(harness.app);
    await createTokenUse(user._id, LIMIT - 1);
    expect(await quotaOf(session)).toMatchObject({ available: true, tokenLimitReached: false });

    await createTokenUse(user._id, 1);
    expect(await quotaOf(session)).toMatchObject({ available: false, tokenLimitReached: true });

    // Yesterday's use doesn't count against today.
    vi.setSystemTime(new Date("2026-03-11T00:01:00Z"));
    expect(await quotaOf(session)).toMatchObject({ available: true, tokenLimitReached: false });
  });

  it("refuses a start once the cap is reached, without using a session", async () => {
    const { session, user } = await practiceStudent(harness.app);
    await createTokenUse(user._id, LIMIT);

    const { res } = await startPractice(session);

    expect(res.status).toBe(429);
    expect(errorOf(res)).toMatchObject({
      code: "token_limit_reached",
      message: "You’ve used today’s practice allowance. It resets at midnight UTC",
    });
    expect(res.headers["retry-after"]).toBe(String(9 * 60 * 60));
    expect(callCount(harness.stub, "/v1/plan")).toBe(0);
    expect(await quotaOf(session)).toMatchObject({ dailyUsed: 0, monthlyUsed: 0 });
  });

  it("refuses every one of many parallel starts at the cap", async () => {
    const { user } = await practiceStudent(harness.app);
    await createTokenUse(user._id, LIMIT);

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => reserveStart(CONFIG, user.id, NOW)),
    );

    for (const result of results) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") expect(result.reason).toBeInstanceOf(TokenLimitError);
    }
    const row = await PracticeStart.findOne({ studentId: user._id, month: "2026-03" }).lean();
    expect(row?.starts ?? 0).toBe(0);
  });

  it("refuses a new turn once the cap is reached, but the session can still be scored", async () => {
    const { session, user } = await practiceStudent(harness.app);
    const { attemptId } = await startPractice(session);
    await sendTurns(session, attemptId, 2);
    await createTokenUse(user._id, LIMIT);
    const turnsBefore = callCount(harness.stub, "/v1/turn");

    const { res } = await sendTurn(session, attemptId, "One more question about routing?");

    expect(res.status).toBe(429);
    expect(errorOf(res).code).toBe("token_limit_reached");
    expect(callCount(harness.stub, "/v1/turn")).toBe(turnsBefore);
    const stored = await PracticeAttempt.findById(attemptId).lean();
    expect(stored).toMatchObject({ status: "active", turnLockUntil: null });
    expect(stored?.transcript.filter((entry) => entry.role === "student")).toHaveLength(2);

    const ended = await session.post(`${sessionsPath}/${attemptId}/end`);
    expect(ended.status).toBe(200);
    expect((ended.body as { attempt: { status: string } }).attempt.status).toBe("completed");
  });

  it("makes the first scoring call at the cap, but no retry", async () => {
    const { session, user } = await practiceStudent(harness.app);
    const { attemptId } = await startPractice(session);
    await sendTurns(session, attemptId, 2);
    await createTokenUse(user._id, LIMIT);
    harness.stub.fail("/v1/score", { status: 502, code: "upstream_error" });

    expect((await session.post(`${sessionsPath}/${attemptId}/end`)).status).toBe(502);
    expect(callCount(harness.stub, "/v1/score")).toBe(1);

    harness.stub.clear();
    const retried = await session.post(`${sessionsPath}/${attemptId}/end`);

    expect(retried.status).toBe(429);
    expect(errorOf(retried).code).toBe("token_limit_reached");
    expect(retried.headers["retry-after"]).toBe(String(9 * 60 * 60));
    expect(callCount(harness.stub, "/v1/score")).toBe(0);
    const stored = await PracticeAttempt.findById(attemptId).lean();
    expect(stored).toMatchObject({ status: "active", turnLockUntil: null, scoreTries: 1 });

    // The cap resets at midnight UTC, and the session can be scored then.
    vi.setSystemTime(new Date("2026-03-11T00:01:00Z"));
    const next = await session.post(`${sessionsPath}/${attemptId}/end`);
    expect((next.body as { attempt: { status: string } }).attempt.status).toBe("completed");
  });

  it("loses no tokens when usage from many calls lands at once", async () => {
    const { user } = await practiceStudent(harness.app);

    await Promise.all(
      Array.from({ length: 20 }, () =>
        recordUsage(user._id, { inputTokens: 100, outputTokens: 50 }, NOW),
      ),
    );

    expect(await studentTokens(user._id)).toBe(3000);
    expect(await today()).toEqual({ input: 2000, output: 1000 });
  });
});
