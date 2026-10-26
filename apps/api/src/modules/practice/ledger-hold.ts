import { createHmac } from "node:crypto";
import type { Types } from "mongoose";
import type { Config } from "../../config.js";
import { PracticeHold, PracticeStart } from "../../db/models/index.js";
import { monthKey, upsertRow } from "./quota.js";

type HoldConfig = Pick<Config, "SESSION_SECRET">;

interface LedgerCounts {
  starts: number;
  days: Map<string, number>;
  tokens: Map<string, number>;
  expiresAt: Date;
}

/**
 * The key a deleted student's ledger is held under: a hex HMAC of the normalized email, keyed with
 * `SESSION_SECRET`. Without the secret it can't be turned back into the address or matched
 * against a list of addresses.
 */
function ledgerEmailKey(config: HoldConfig, email: string): string {
  return createHmac("sha256", config.SESSION_SECRET)
    .update(`practice-ledger:${email.trim().toLowerCase()}`)
    .digest("hex");
}

/** One update that adds `counts` to a ledger row (or a hold), creating it if needed. */
function addCounts({ starts, days, tokens, expiresAt }: LedgerCounts) {
  const perDay = (field: string, values: Map<string, number>) =>
    Object.fromEntries([...values].map(([day, count]) => [`${field}.${day}`, count]));
  return {
    $inc: { starts, ...perDay("days", days), ...perDay("tokens", tokens) },
    $setOnInsert: { expiresAt },
  };
}

/**
 * Moves this month's ledger of a student whose account is being deleted into a hold under their
 * email key, adding to any hold already there. Earlier months are never read again, so they go
 * with the rest of the account. Safe to repeat: the ledger row is removed as it is read.
 */
export async function holdLedger(
  config: HoldConfig,
  studentId: string | Types.ObjectId,
  email: string,
  now: Date,
): Promise<void> {
  const month = monthKey(now);
  const ledger = await PracticeStart.findOneAndDelete({ studentId, month });
  if (!ledger) return;
  const emailKey = ledgerEmailKey(config, email);
  await upsertRow(
    (options) => PracticeHold.updateOne({ emailKey, month }, addCounts(ledger), options),
    "emailKey",
  );
}

/**
 * Gives a new student account the counts held for its email this month, if any, and removes the
 * hold. Signing up again therefore starts from where the deleted account left off.
 */
export async function restoreLedger(
  config: HoldConfig,
  studentId: Types.ObjectId,
  email: string,
  now: Date,
): Promise<void> {
  const month = monthKey(now);
  const hold = await PracticeHold.findOneAndDelete({
    emailKey: ledgerEmailKey(config, email),
    month,
  });
  if (!hold) return;
  await upsertRow(
    (options) => PracticeStart.updateOne({ studentId, month }, addCounts(hold), options),
    "month",
  );
}
