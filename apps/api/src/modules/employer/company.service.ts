import type { CompanyUpdate, PublicCompany } from "@pitchperfect/shared";
import { toPublicCompany } from "../../db/mappers.js";
import { Company, User } from "../../db/models/index.js";
import { ConflictError } from "../../errors.js";
import { verificationForCompany } from "../../services/company-verification.js";
import type { CompanyDoc } from "./ownership.js";

/**
 * Domain verification after a website change. Only an owner with a confirmed email can earn or
 * keep "verified" (anyone can type someone else's address), and `suspended` is never touched.
 */
async function verificationAfterWebsiteChange(
  company: CompanyDoc,
  website: string,
): Promise<CompanyDoc["verification"]> {
  if (company.verification === "suspended") return company.verification;
  const owner = await User.findById(company.ownerId).select("email emailVerifiedAt").lean();
  if (!owner?.emailVerifiedAt) return company.verification;
  return verificationForCompany(owner.email.slice(owner.email.lastIndexOf("@") + 1), website);
}

/** Applies the update. `null` clears an optional url; a changed website re-runs verification. */
export async function updateCompany(
  company: CompanyDoc,
  { name, website, linkedinUrl, pitch, logoUrl }: CompanyUpdate,
): Promise<PublicCompany> {
  const changedWebsite = website !== undefined && website !== company.website ? website : undefined;
  const set = {
    ...(name !== undefined && { name }),
    ...(website !== undefined && { website }),
    ...(pitch !== undefined && { pitch }),
    ...(linkedinUrl != null && { linkedinUrl }),
    ...(logoUrl != null && { logoUrl }),
    ...(changedWebsite !== undefined && {
      verification: await verificationAfterWebsiteChange(company, changedWebsite),
    }),
  };
  const unset = {
    ...(linkedinUrl === null && { linkedinUrl: 1 }),
    ...(logoUrl === null && { logoUrl: 1 }),
  };
  const updated = await Company.findOneAndUpdate(
    {
      _id: company._id,
      ownerId: company.ownerId,
      // A suspension that landed while we were deciding must not be overwritten.
      ...(changedWebsite !== undefined && { verification: company.verification }),
    },
    { $set: set, $unset: unset },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (!updated)
    throw new ConflictError("conflict", "The company just changed. Refresh and try again");
  return toPublicCompany(updated);
}
