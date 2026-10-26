import type { CompanyUpdate, PublicCompany } from "@pitchperfect/shared";
import { toPublicCompany } from "../../db/mappers.js";
import type { VerificationLockReason } from "../../db/models/company.js";
import { Company } from "../../db/models/index.js";
import { ConflictError } from "../../errors.js";
import { sameCompanyDomain } from "../../services/company-verification.js";
import type { CompanyDoc } from "./ownership.js";

/**
 * How the update changes the company's identity: `renamed`, `domain_changed` (its website moves
 * to another registrable domain), or null for neither. A rename wins when it does both.
 */
function identityChange(
  company: CompanyDoc,
  { name, website }: CompanyUpdate,
): VerificationLockReason | null {
  if (name !== undefined && name.trim() !== company.name) return "renamed";
  if (website !== undefined && !sameCompanyDomain(website, company.website)) {
    return "domain_changed";
  }
  return null;
}

/**
 * Applies the update. `null` clears an optional url. The badge vouches for one name on one domain,
 * so a new name or domain sends a verified company back to `unverified`. A company that has had
 * the badge (it is verified, or has a `verifiedDomain`) also gets `verificationLockedReason`, after
 * which only an admin approval gives the badge back, never the owner's email. An edit never grants
 * the badge, and `suspended` is never touched.
 */
export async function updateCompany(
  company: CompanyDoc,
  update: CompanyUpdate,
): Promise<PublicCompany> {
  const { name, website, linkedinUrl, pitch, logoUrl } = update;
  const change = identityChange(company, update);
  const hadBadge = company.verification === "verified" || company.verifiedDomain !== undefined;
  const lock = change !== null && hadBadge && company.verificationLockedReason === undefined;
  const set = {
    ...(name !== undefined && { name }),
    ...(website !== undefined && { website }),
    ...(pitch !== undefined && { pitch }),
    ...(linkedinUrl != null && { linkedinUrl }),
    ...(logoUrl != null && { logoUrl }),
    ...(change !== null && company.verification === "verified" && { verification: "unverified" }),
    ...(lock && { verificationLockedReason: change }),
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
      ...(change !== null && { verification: company.verification }),
    },
    { $set: set, $unset: unset },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (!updated)
    throw new ConflictError("conflict", "The company just changed. Refresh and try again");
  return toPublicCompany(updated);
}
