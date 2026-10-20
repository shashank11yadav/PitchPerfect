import mongoose from "mongoose";
import type { PracticeQuota } from "@pitchperfect/shared";
import type { Config } from "../../config.js";
import { PracticeAttempt, UsageDay } from "../../db/models/index.js";
import { BudgetExhaustedError, QuotaExceededError } from "../../errors.js";
import { isDuplicateKey } from "../auth/service.js";

type QuotaConfig = Pick<
  Config,
  "PRACTICE_DAILY_LIMIT" | "PRACTICE_MONTHLY_LIMIT" | "PRACTICE_DAILY_TOKEN_BUDGET"
>;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Start of the UTC day `offset` days from `now`'s. */
const utcDay = (now: Date, offset = 0) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));

/** Start of the UTC calendar month `offset` months from `now`'s. */
const utcMonth = (now: Date, offset = 0) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));

const secondsUntil = (now: Date, then: Date) =>
  Math.max(1, Math.ceil((then.getTime() - now.getTime()) / 1000));

/** `YYYY-MM-DD` of the UTC day, the key of `usagedays`. */
const dayKey = (now: Date) => now.toISOString().slice(0, 10);

/** Seconds until the next UTC midnight; the `Retry-After` for anything that resets daily. */
const secondsToMidnight = (now: Date) => secondsUntil(now, utcDay(now, 1));

/**
 * A `starting` placeholder older than this belongs to a start that crashed (planning gives up
 * after 35 s): it no longer counts, and the student's next start clears it.
 */
export const STALE_START_MS = 60_000;

/**
 * Sessions started in `[from, to)` that count: every attempt whose scenario was planned (all but
 * `starting`, since a failed plan deletes its placeholder), plus a start that is still planning.
 * Each plan costs tokens, so a session counts whether or not the student took a turn.
 */
function countStarted(studentId: string, from: Date, to: Date, now: Date): Promise<number> {
  return PracticeAttempt.countDocuments({
    studentId,
    startedAt: mongoose.trusted({ $gte: from, $lt: to }),
    $or: [
      { status: mongoose.trusted({ $ne: "starting" }) },
      { startedAt: mongoose.trusted({ $gte: new Date(now.getTime() - STALE_START_MS) }) },
    ],
  });
}

export async function getQuota(
  config: QuotaConfig,
  studentId: string,
  now: Date,
): Promise<PracticeQuota> {
  const [dailyUsed, monthlyUsed] = await Promise.all([
    countStarted(studentId, utcDay(now), utcDay(now, 1), now),
    countStarted(studentId, utcMonth(now), utcMonth(now, 1), now),
  ]);
  const dailyLimit = config.PRACTICE_DAILY_LIMIT;
  const monthlyLimit = config.PRACTICE_MONTHLY_LIMIT;
  return {
    dailyUsed,
    dailyLimit,
    monthlyUsed,
    monthlyLimit,
    available: dailyUsed < dailyLimit && monthlyUsed < monthlyLimit,
    resetsAt: utcDay(now, 1).toISOString(),
  };
}

/**
 * Throws `quota_exceeded` when the student has used their daily or monthly sessions, and
 * `budget_exhausted` when today's global token budget is spent. `Retry-After` points at the reset.
 */
export async function assertCanStart(
  config: QuotaConfig,
  studentId: string,
  now: Date,
): Promise<void> {
  const quota = await getQuota(config, studentId, now);
  if (quota.monthlyUsed >= quota.monthlyLimit) {
    throw new QuotaExceededError(secondsUntil(now, utcMonth(now, 1)));
  }
  if (quota.dailyUsed >= quota.dailyLimit) throw new QuotaExceededError(secondsToMidnight(now));

  const today = await UsageDay.findOne({ day: dayKey(now) }).lean();
  const spent = (today?.inputTokens ?? 0) + (today?.outputTokens ?? 0);
  if (spent >= config.PRACTICE_DAILY_TOKEN_BUDGET) {
    throw new BudgetExhaustedError(secondsToMidnight(now));
  }
}

/** Adds coach usage to today's `usagedays` row (created on first use); `session` counts a start. */
export async function recordUsage(
  usage: TokenUsage,
  now: Date,
  options: { session?: boolean } = {},
): Promise<void> {
  const update = {
    $inc: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      ...(options.session ? { sessions: 1 } : {}),
    },
  };
  const day = dayKey(now);
  try {
    await UsageDay.updateOne({ day }, update, { upsert: true });
  } catch (error) {
    // Two first-of-the-day upserts raced; the row exists now.
    if (!isDuplicateKey(error, "day")) throw error;
    await UsageDay.updateOne({ day }, update);
  }
}
