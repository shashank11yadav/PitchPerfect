import mongoose from "mongoose";
import type { Config } from "../../config.js";
import { PracticeAttempt, UsageDay } from "../../db/models/index.js";
import { BudgetExhaustedError, QuotaExceededError } from "../../errors.js";
import { isDuplicateKey } from "../auth/service.js";

export interface QuotaView {
  dailyUsed: number;
  dailyLimit: number;
  monthlyUsed: number;
  monthlyLimit: number;
  available: boolean;
  /** The next UTC midnight, when the daily count starts over. */
  resetsAt: string;
}

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

/** Sessions started in `[from, to)` that count: all but those abandoned before any student turn. */
function countStarted(studentId: string, from: Date, to: Date): Promise<number> {
  return PracticeAttempt.countDocuments({
    studentId,
    startedAt: mongoose.trusted({ $gte: from, $lt: to }),
    $or: [{ status: mongoose.trusted({ $ne: "abandoned" }) }, { "transcript.role": "student" }],
  });
}

export async function getQuota(
  config: QuotaConfig,
  studentId: string,
  now: Date,
): Promise<QuotaView> {
  const [dailyUsed, monthlyUsed] = await Promise.all([
    countStarted(studentId, utcDay(now), utcDay(now, 1)),
    countStarted(studentId, utcMonth(now), utcMonth(now, 1)),
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
