import type { CompanyUpdate, PublicCompany } from "@pitchperfect/shared";
import { toPublicCompany } from "../../db/mappers.js";
import { Company } from "../../db/models/index.js";
import { ConflictError } from "../../errors.js";
import { sameCompanyDomain } from "../../services/company-verification.js";
import type { CompanyDoc } from "./ownership.js";

/**
 * True when the update renames the company or moves its website to another domain. The badge
 * vouches for that name on that domain, so a verified company then goes back to `unverified` until
 * an admin approves it again. An edit never grants the badge, and `suspended` is never touched.
 */
function changesIdentity(company: CompanyDoc, { name, website }: CompanyUpdate): boolean {
  const renamed = name !== undefined && name.trim() !== company.name;
  const moved = website !== undefined && !sameCompanyDomain(website, company.website);
  return renamed || moved;
}

/** Applies the update. `null` clears an optional url; a new name or domain drops the badge. */
export async function updateCompany(
  company: CompanyDoc,
  update: CompanyUpdate,
): Promise<PublicCompany> {
  const { name, website, linkedinUrl, pitch, logoUrl } = update;
  const identityChanged = changesIdentity(company, update);
  const set = {
    ...(name !== undefined && { name }),
    ...(website !== undefined && { website }),
    ...(pitch !== undefined && { pitch }),
    ...(linkedinUrl != null && { linkedinUrl }),
    ...(logoUrl != null && { logoUrl }),
    ...(identityChanged && company.verification === "verified" && { verification: "unverified" }),
  };
  const unset = {
    ...(linkedinUrl === null && { linkedinUrl: 1 }),
    ...(logoUrl === null && { logoUrl: 1 }),
  };
  const updated = await Company.findOneAndUpdate(
    {
      _id: company._id,
      ownerId: company.ownerId,
      // An approval or suspension that landed while we were deciding must not be overwritten.
      ...(identityChanged && { verification: company.verification }),
    },
    { $set: set, $unset: unset },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (!updated)
    throw new ConflictError("conflict", "The company just changed. Refresh and try again");
  return toPublicCompany(updated);
}
