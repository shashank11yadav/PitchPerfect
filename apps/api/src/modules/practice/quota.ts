import mongoose, { type Types } from "mongoose";
import { secondsUntil, utcDay, utcMonth, type PracticeQuota } from "@pitchperfect/shared";
import type { Config } from "../../config.js";
import { PracticeAttempt, PracticeStart, UsageDay } from "../../db/models/index.js";
import {
  BudgetExhaustedError,
  QuotaExceededError,
  TokenLimitError,
  UpstreamError,
} from "../../errors.js";
import { usageOfFailure } from "../../services/coach-client.js";
import { isDuplicateKey } from "../auth/service.js";

type QuotaConfig = Pick<
  Config,
  | "PRACTICE_DAILY_LIMIT"
  | "PRACTICE_MONTHLY_LIMIT"
  | "PRACTICE_DAILY_TOKEN_BUDGET"
  | "PRACTICE_STUDENT_DAILY_TOKEN_LIMIT"
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
 * Sessions started today and this month, and the tokens used today, from the student's ledger.
 * Every reserved start counts, planned or still planning, turns or not; deleting an attempt
 * doesn't change either count.
 */
async function ledgerOf(studentId: string, now: Date) {
  // Not lean: the hydrated document gives `days` and `tokens` as Maps.
  const row = await PracticeStart.findOne({ studentId, month: monthKey(now) }).select(
    "starts days tokens",
  );
  return {
    dailyUsed: row?.days.get(dayKey(now)) ?? 0,
    monthlyUsed: row?.starts ?? 0,
    tokensUsed: row?.tokens.get(dayKey(now)) ?? 0,
  };
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
  const [{ dailyUsed, monthlyUsed, tokensUsed }, budgetExhausted] = await Promise.all([
    ledgerOf(studentId, now),
    budgetSpent(config, now),
  ]);
  const dailyLimit = config.PRACTICE_DAILY_LIMIT;
  const monthlyLimit = config.PRACTICE_MONTHLY_LIMIT;
  const tokenLimitReached = tokensUsed >= config.PRACTICE_STUDENT_DAILY_TOKEN_LIMIT;
  return {
    dailyUsed,
    dailyLimit,
    monthlyUsed,
    monthlyLimit,
    available:
      dailyUsed < dailyLimit &&
      monthlyUsed < monthlyLimit &&
      !budgetExhausted &&
      !tokenLimitReached,
    budgetExhausted,
    tokenLimitReached,
    resetsAt: utcDay(now, 1).toISOString(),
  };
}

/**
 * Throws `token_limit_reached` once the student's tokens today reach their cap, with `Retry-After`
 * at the next UTC midnight. Turns check this before calling the coach; a student has at most one
 * turn in flight, so a turn started under the cap can go over it by that turn's tokens only.
 */
export async function assertTokensLeft(
  config: QuotaConfig,
  studentId: string,
  now: Date,
): Promise<void> {
  const { tokensUsed } = await ledgerOf(studentId, now);
  if (tokensUsed >= config.PRACTICE_STUDENT_DAILY_TOKEN_LIMIT) {
    throw new TokenLimitError(secondsToMidnight(now));
  }
}

/**
 * Throws `budget_exhausted` once today's global token budget is spent, with `Retry-After` at the
 * next UTC midnight. Turns check this before calling the coach; ending and scoring don't, so a
 * session in progress can still get its scorecard.
 */
export async function assertBudgetLeft(config: QuotaConfig, now: Date): Promise<void> {
  if (await budgetSpent(config, now)) {
    throw new BudgetExhaustedError(
      secondsToMidnight(now),
      "Practice is at capacity for today. End the session to get your scorecard",
    );
  }
}

/**
 * Counts a start in the student's ledger row for this month unless the day or the month is used
 * up, or the student's tokens today have reached their cap. The checks and the count are one
 * conditional update, so parallel starts can't go over.
 */
async function countStart(config: QuotaConfig, studentId: string, now: Date): Promise<boolean> {
  const today = `days.${dayKey(now)}`;
  const filter = {
    studentId,
    month: monthKey(now),
    starts: mongoose.trusted({ $lt: config.PRACTICE_MONTHLY_LIMIT }),
    [today]: mongoose.trusted({ $not: { $gte: config.PRACTICE_DAILY_LIMIT } }),
    [`tokens.${dayKey(now)}`]: mongoose.trusted({
      $not: { $gte: config.PRACTICE_STUDENT_DAILY_TOKEN_LIMIT },
    }),
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
 * daily or monthly sessions are used, `token_limit_reached` when the student's tokens today are,
 * and `budget_exhausted` (giving the session back) when today's global token budget is spent.
 * `Retry-After` points at the reset.
 */
export async function reserveStart(
  config: QuotaConfig,
  studentId: string,
  now: Date,
): Promise<void> {
  if (!(await countStart(config, studentId, now))) {
    // Read after the refusal, so a parallel start may have given a session back by now; only a
    // spent token cap is told apart from a used-up quota.
    const { monthlyUsed, tokensUsed } = await ledgerOf(studentId, now);
    const monthUsedUp = monthlyUsed >= config.PRACTICE_MONTHLY_LIMIT;
    if (!monthUsedUp && tokensUsed >= config.PRACTICE_STUDENT_DAILY_TOKEN_LIMIT) {
      throw new TokenLimitError(secondsToMidnight(now));
    }
    throw new QuotaExceededError(
      monthUsedUp ? secondsUntil(now, utcMonth(now, 1)) : secondsToMidnight(now),
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

/**
 * Charges what a failed coach call used to the student and today's budget: what the coach
 * reported, nothing for a call it turned away, or `estimate()` for an upstream failure that said
 * nothing (a timeout or a dropped connection). Returns what it charged.
 */
export async function chargeFailedCall(
  studentId: string | Types.ObjectId,
  error: unknown,
  estimate: () => TokenUsage,
): Promise<TokenUsage | undefined> {
  const usage = usageOfFailure(error) ?? (error instanceof UpstreamError ? estimate() : undefined);
  if (usage && usage.inputTokens + usage.outputTokens > 0) {
    await recordUsage(studentId, usage, new Date());
    return usage;
  }
  return undefined;
}

/**
 * Runs an `$inc` update as an upsert. Two first upserts can race; the loser finds the row the
 * winner created (a duplicate key on `key`) and updates it instead.
 */
async function upsertRow(
  update: (options: { upsert?: boolean }) => Promise<unknown>,
  key: string,
): Promise<void> {
  try {
    await update({ upsert: true });
  } catch (error) {
    if (!isDuplicateKey(error, key)) throw error;
    await update({});
  }
}

/**
 * Adds coach usage to today's `usagedays` row and to the student's tokens for today in their
 * ledger (each created on first use); `session` counts a start. Both are `$inc` updates, so
 * usage landing at once is never lost.
 */
export async function recordUsage(
  studentId: string | Types.ObjectId,
  usage: TokenUsage,
  now: Date,
  options: { session?: boolean } = {},
): Promise<void> {
  const day = dayKey(now);
  const global = {
    $inc: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      ...(options.session ? { sessions: 1 } : {}),
    },
  };
  const own = {
    $inc: { [`tokens.${day}`]: usage.inputTokens + usage.outputTokens },
    $setOnInsert: { expiresAt: utcMonth(now, 1) },
  };
  const month = monthKey(now);
  await Promise.all([
    upsertRow((options) => UsageDay.updateOne({ day }, global, options), "day"),
    upsertRow((options) => PracticeStart.updateOne({ studentId, month }, own, options), "month"),
  ]);
}
