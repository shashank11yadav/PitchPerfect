import { createHmac } from "node:crypto";
import type { Types } from "mongoose";
import type { Config } from "../../config.js";
import { EmployerHold } from "../../db/models/index.js";

type HoldConfig = Pick<Config, "SESSION_SECRET">;

interface HeldCompany {
  _id: Types.ObjectId;
  /** The domain the badge vouched for; a website alone proves nothing, so it isn't held. */
  verifiedDomain?: string | null;
}

/**
 * The key an owner's email is held under: a hex HMAC of the normalized email, keyed with
 * `SESSION_SECRET`, so the row can't be turned back into the address without the secret.
 */
function heldEmailKey(config: HoldConfig, email: string): string {
  return createHmac("sha256", config.SESSION_SECRET)
    .update(`employer-hold:${email.trim().toLowerCase()}`)
    .digest("hex");
}

const domainOf = ({ verifiedDomain }: HeldCompany) =>
  verifiedDomain ? { $set: { domain: verifiedDomain } } : {};

/** Holds a company an admin suspends: its verified domain, linked to the company. Safe to repeat. */
export async function holdSuspendedCompany(company: HeldCompany): Promise<void> {
  await EmployerHold.updateOne(
    { companyId: company._id },
    { ...domainOf(company), $setOnInsert: { emailKeys: [] } },
    { upsert: true },
  );
}

/**
 * Adds `email` to a suspended company's hold (creating the hold if the company has none yet), so
 * the address can't open an employer account once it leaves the company's owner.
 */
export async function holdOwnerEmail(
  config: HoldConfig,
  company: HeldCompany,
  email: string,
): Promise<void> {
  await EmployerHold.updateOne(
    { companyId: company._id },
    { ...domainOf(company), $addToSet: { emailKeys: heldEmailKey(config, email) } },
    { upsert: true },
  );
}

/** The company is gone: its hold stays, naming no account. */
export async function detachHold(companyId: Types.ObjectId): Promise<void> {
  await EmployerHold.updateOne({ companyId }, { $unset: { companyId: 1 } });
}

/** Removes a company's hold, when an admin lifts its suspension. */
export async function releaseHold(companyId: Types.ObjectId): Promise<void> {
  await EmployerHold.deleteMany({ companyId });
}

export async function isEmailHeld(config: HoldConfig, email: string): Promise<boolean> {
  return (await EmployerHold.exists({ emailKeys: heldEmailKey(config, email) })) !== null;
}

export async function isDomainHeld(domain: string | null): Promise<boolean> {
  return domain !== null && (await EmployerHold.exists({ domain })) !== null;
}
