import mongoose, { type Types } from "mongoose";
import { secondsUntil, utcDay, utcMonth, type PracticeQuota } from "@pitchperfect/shared";
import type { Config } from "../../config.js";
import { PracticeAttempt, PracticeStart, UsageDay } from "../../db/models/index.js";
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

/** `YYYY-MM-DD` of the UTC day, the key of `usagedays` and of a start ledger's `days`. */
const dayKey = (now: Date) => now.toISOString().slice(0, 10);

/** `YYYY-MM` of the UTC month, the key of a student's start ledger row. */
const monthKey = (now: Date) => now.toISOString().slice(0, 7);

/** Seconds until the next UTC midnight; the `Retry-After` for anything that resets daily. */
const secondsToMidnight = (now: Date) => secondsUntil(now, utcDay(now, 1));

/**
 * A `starting` placeholder older than this belongs to a start that crashed (planning gives up
 * after 35 s): the student's next start clears it and gives the session back.
 */
export const STALE_START_MS = 60_000;

/**
 * Sessions started today and this month, from the student's start ledger. Every reserved start
 * counts, planned or still planning, turns or not; deleting an attempt doesn't change it.
 */
async function startsUsed(studentId: string, now: Date) {
  // Not lean: the hydrated document gives `days` as a Map.
  const row = await PracticeStart.findOne({ studentId, month: monthKey(now) }).select(
    "starts days",
  );
  return { dailyUsed: row?.days.get(dayKey(now)) ?? 0, monthlyUsed: row?.starts ?? 0 };
}

/** True once today's `usagedays` row has used up the global token budget. */
async function budgetSpent(config: QuotaConfig, now: Date): Promise<boolean> {
  const today = await UsageDay.findOne({ day: dayKey(now) }).lean();
  const spent = (today?.inputTokens ?? 0) + (today?.outputTokens ?? 0);
  return spent >= config.PRACTICE_DAILY_TOKEN_BUDGET;
}

/** The counts and limits; the handler adds which kind of partner answers. */
export async function getQuota(
  config: QuotaConfig,
  studentId: string,
  now: Date,
): Promise<Omit<PracticeQuota, "practicePartner">> {
  const [{ dailyUsed, monthlyUsed }, budgetExhausted] = await Promise.all([
    startsUsed(studentId, now),
    budgetSpent(config, now),
  ]);
  const dailyLimit = config.PRACTICE_DAILY_LIMIT;
  const monthlyLimit = config.PRACTICE_MONTHLY_LIMIT;
  return {
    dailyUsed,
    dailyLimit,
    monthlyUsed,
    monthlyLimit,
    available: dailyUsed < dailyLimit && monthlyUsed < monthlyLimit && !budgetExhausted,
    budgetExhausted,
    resetsAt: utcDay(now, 1).toISOString(),
  };
}

/**
 * Counts a start in the student's ledger row for this month unless the day or the month is used
 * up. The check and the count are one conditional update, so parallel starts can't go over.
 */
async function countStart(config: QuotaConfig, studentId: string, now: Date): Promise<boolean> {
  const today = `days.${dayKey(now)}`;
  const filter = {
    studentId,
    month: monthKey(now),
    starts: mongoose.trusted({ $lt: config.PRACTICE_MONTHLY_LIMIT }),
    [today]: mongoose.trusted({ $not: { $gte: config.PRACTICE_DAILY_LIMIT } }),
  };
  const update = {
    $inc: { starts: 1, [today]: 1 },
    $setOnInsert: { expiresAt: utcMonth(now, 1) },
  };
  try {
    await PracticeStart.updateOne(filter, update, { upsert: true });
    return true;
  } catch (error) {
    // Either the row is full (so the upsert tried to insert a second one), or two first starts
    // of the month raced and the other one created it.
    if (!isDuplicateKey(error, "month")) throw error;
    return (await PracticeStart.updateOne(filter, update)).matchedCount > 0;
  }
}

/**
 * Takes one of the student's sessions for a start at `now`. Throws `quota_exceeded` when the
 * daily or monthly sessions are used, and `budget_exhausted` (giving the session back) when
 * today's global token budget is spent. `Retry-After` points at the reset.
 */
export async function reserveStart(
  config: QuotaConfig,
  studentId: string,
  now: Date,
): Promise<void> {
  if (!(await countStart(config, studentId, now))) {
    const { monthlyUsed } = await startsUsed(studentId, now);
    throw new QuotaExceededError(
      monthlyUsed >= config.PRACTICE_MONTHLY_LIMIT
        ? secondsUntil(now, utcMonth(now, 1))
        : secondsToMidnight(now),
    );
  }
  if (await budgetSpent(config, now)) {
    await refundStart(studentId, now);
    throw new BudgetExhaustedError(secondsToMidnight(now));
  }
}

/** Gives back a session reserved at `startedAt` that was never planned. */
export async function refundStart(
  studentId: string | Types.ObjectId,
  startedAt: Date,
): Promise<void> {
  const day = `days.${dayKey(startedAt)}`;
  await PracticeStart.updateOne(
    { studentId, month: monthKey(startedAt), [day]: mongoose.trusted({ $gt: 0 }) },
    { $inc: { starts: -1, [day]: -1 } },
  );
}

interface Placeholder {
  _id: Types.ObjectId;
  studentId: Types.ObjectId;
  startedAt: Date;
}

/** Removes a `starting` placeholder and refunds its start; false if it was already gone. */
export async function removePlaceholder(placeholder: Placeholder): Promise<boolean> {
  const { deletedCount } = await PracticeAttempt.deleteOne({
    _id: placeholder._id,
    status: "starting",
  });
  if (deletedCount === 0) return false;
  await refundStart(placeholder.studentId, placeholder.startedAt);
  return true;
}

/**
 * Removes the placeholders of starts that began before `before` and never finished planning (one
 * student's, or everyone's), refunding each. Returns how many it removed.
 */
export async function removeStalePlaceholders(before: Date, studentId?: string): Promise<number> {
  const stale = await PracticeAttempt.find({
    ...(studentId !== undefined && { studentId }),
    status: "starting",
    startedAt: mongoose.trusted({ $lt: before }),
  })
    .select("studentId startedAt")
    .lean();
  const removed = await Promise.all(stale.map(removePlaceholder));
  return removed.filter(Boolean).length;
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
