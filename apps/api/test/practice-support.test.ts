import { afterEach, describe, expect, it, vi } from "vitest";
import { LIMITS, MINUTE_MS, SUPPORT_LINE } from "@pitchperfect/shared";
import { PracticeAttempt, UsageDay } from "../src/db/models/index.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import { createTokenUse, practiceTranscript } from "./helpers/factories.js";
import {
  practiceStudent,
  sendTurn,
  startPractice,
  usePracticeHarness,
} from "./helpers/practice.js";
import { callCount } from "./helpers/stub-coach.js";

useTestDb();
const LIMIT = 50_000;
const harness = usePracticeHarness({ env: { PRACTICE_STUDENT_DAILY_TOKEN_LIMIT: String(LIMIT) } });

const CRISIS = "Honestly some days I just want to end my life.";

afterEach(() => {
  vi.restoreAllMocks();
});

async function activeAttempt() {
  const student = await practiceStudent(harness.app);
  const { attemptId } = await startPractice(student.session);
  return { ...student, attemptId };
}

/** Today's global usage, in tokens. */
async function spentToday() {
  const rows = await UsageDay.find().lean();
  return rows.reduce((sum, row) => sum + row.inputTokens + row.outputTokens, 0);
}

/**
 * Sends `CRISIS` and checks it got the support message alone, without the coach, without tokens
 * and without anything stored.
 */
async function expectSupport(
  session: Awaited<ReturnType<typeof practiceStudent>>["session"],
  attemptId: string,
) {
  const before = await PracticeAttempt.findById(attemptId).lean();
  const spent = await spentToday();
  const turns = callCount(harness.stub, "/v1/turn");

  const { res, events } = await sendTurn(session, attemptId, CRISIS);

  expect(res.status).toBe(200);
  expect(events).toEqual([{ event: "support", data: { text: SUPPORT_LINE } }]);
  expect(callCount(harness.stub, "/v1/turn")).toBe(turns);
  expect(await spentToday()).toBe(spent);
  const after = await PracticeAttempt.findById(attemptId).lean();
  expect(after?.transcript).toEqual(before?.transcript);
  expect(after?.status).toBe(before?.status);
  expect(after?.turnLockUntil ?? null).toBeNull();
}

describe("a turn that signals self-harm", () => {
  it("gets the support message without the coach, even when nothing refuses the turn", async () => {
    const { session, attemptId } = await activeAttempt();
    await expectSupport(session, attemptId);
  });

  it("gets it once the student's tokens for today are used up", async () => {
    const { session, user, attemptId } = await activeAttempt();
    await createTokenUse(user._id, LIMIT);
    expect((await sendTurn(session, attemptId, "How do you plan routes?")).res.status).toBe(429);

    await expectSupport(session, attemptId);
  });

  it("gets it after the turn limit", async () => {
    const { session, attemptId } = await activeAttempt();
    await PracticeAttempt.updateOne(
      { _id: attemptId },
      { $set: { transcript: practiceTranscript(LIMITS.maxStudentTurns) } },
    );
    const ordinary = await sendTurn(session, attemptId, "One more question?");
    expect(ordinary.events.map((event) => event.event)).toEqual(["ended"]);

    await expectSupport(session, attemptId);
  });

  it("gets it once the session's time is up", async () => {
    const { session, attemptId } = await activeAttempt();
    const startedAt = new Date(Date.now() - LIMITS.sessionSeconds * 1000 - MINUTE_MS);
    await PracticeAttempt.updateOne({ _id: attemptId }, { $set: { startedAt } });

    await expectSupport(session, attemptId);
  });

  it("gets it while today's global budget is spent", async () => {
    const { session, attemptId } = await activeAttempt();
    await UsageDay.updateOne(
      { day: new Date().toISOString().slice(0, 10) },
      { $inc: { inputTokens: 2_000_000 } },
      { upsert: true },
    );
    expect((await startPractice(session)).res.status).toBe(429);

    await expectSupport(session, attemptId);
  });

  it("gets it on a session that has ended, and while the coach is down", async () => {
    const { session, attemptId } = await activeAttempt();
    await PracticeAttempt.updateOne({ _id: attemptId }, { $set: { status: "abandoned" } });
    harness.stub.fail("/v1/turn", { status: 503, code: "practice_unavailable" });

    await expectSupport(session, attemptId);
  });

  it("still checks the body and the attempt's owner first", async () => {
    const { attemptId } = await activeAttempt();
    const other = await practiceStudent(harness.app);

    const theirs = await sendTurn(other.session, attemptId, CRISIS);
    expect(theirs.res.status).toBe(404);
    expect(errorOf(theirs.res).code).toBe("not_found");
    const tooLong = await sendTurn(other.session, attemptId, `${CRISIS} ${"x".repeat(1000)}`);
    expect(tooLong.res.status).toBe(400);
  });
});
