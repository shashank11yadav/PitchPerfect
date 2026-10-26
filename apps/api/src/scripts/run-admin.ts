import mongoose from "mongoose";
import * as models from "../db/models/index.js";
import {
  AuthToken,
  Company,
  EmailChange,
  EmployerHold,
  PracticeAttempt,
  PracticeHold,
  PracticeStart,
  User,
} from "../db/models/index.js";
import { holdSuspendedCompany, isDomainHeld, releaseHold } from "../modules/employer/hold.js";
import { registrableDomain, verificationForCompany } from "../services/company-verification.js";

/** Where the admin CLI writes: normal output and problems. */
export interface AdminIo {
  out: (line: string) => void;
  err: (line: string) => void;
}

/** A failure with a message meant for the person running the command. */
class AdminError extends Error {}

interface Command {
  /** Names of the arguments, shown in the usage text. */
  params: readonly string[];
  summary: string;
  run: (args: readonly string[], io: AdminIo) => Promise<void>;
}

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** A company by its id or its slug. */
async function findCompany(reference: string) {
  const byId = OBJECT_ID.test(reference) ? await Company.findById(reference).lean() : null;
  const company = byId ?? (await Company.findOne({ slug: reference }).lean());
  if (!company) throw new AdminError(`No company matches "${reference}"`);
  return company;
}

/** Collections with a TTL index the app relies on to clear expired documents. */
const TTL_MODELS = [PracticeAttempt, PracticeStart, PracticeHold, AuthToken, EmailChange];

async function migrate(_args: readonly string[], io: AdminIo): Promise<void> {
  for (const model of Object.values(models)) {
    const removed = await model.syncIndexes();
    const note = removed.length > 0 ? `, removed ${removed.join(", ")}` : "";
    io.out(`${model.collection.name}: indexes in sync${note}`);
  }
  for (const model of TTL_MODELS) {
    const indexes = await model.collection.indexes();
    const ttl = indexes.find(
      (index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0,
    );
    if (!ttl) throw new AdminError(`${model.collection.name}: the expiry (TTL) index is missing`);
  }
  io.out(`TTL indexes present on ${TTL_MODELS.map((model) => model.collection.name).join(", ")}`);
  const recorded = await recordVerifiedDomains();
  io.out(
    `Verified domain recorded for ${String(recorded)} ${recorded === 1 ? "company" : "companies"}`,
  );
  const held = await holdSuspendedCompanies();
  io.out(`Hold added for ${String(held)} suspended ${held === 1 ? "company" : "companies"}`);
}

/** Gives every suspended company a hold, including those suspended before holds were kept. */
async function holdSuspendedCompanies(): Promise<number> {
  const companies = await Company.find({ verification: "suspended" })
    .select("verifiedDomain")
    .lean();
  let added = 0;
  for (const company of companies) {
    if (await EmployerHold.exists({ companyId: company._id })) continue;
    await holdSuspendedCompany(company);
    added += 1;
  }
  return added;
}

/**
 * Records the domain of each company verified before domains were recorded: its website's
 * registrable domain, which a domain move would have taken the badge from. A later rename then
 * locks the company even if an email change drops the badge first.
 */
async function recordVerifiedDomains(): Promise<number> {
  const companies = await Company.find({ verification: "verified", verifiedDomain: null })
    .select("website")
    .lean();
  let recorded = 0;
  for (const company of companies) {
    const verifiedDomain = registrableDomain(company.website);
    if (verifiedDomain === null) continue;
    const result = await Company.updateOne(
      { _id: company._id, verification: "verified", verifiedDomain: null },
      { $set: { verifiedDomain } },
    );
    recorded += result.modifiedCount;
  }
  return recorded;
}

async function listUnverified(_args: readonly string[], io: AdminIo): Promise<void> {
  const companies = await Company.find({ verification: "unverified" })
    .sort({ createdAt: 1 })
    .lean();
  if (companies.length === 0) {
    io.out("No unverified companies");
    return;
  }
  const owners = await User.find({
    _id: mongoose.trusted({ $in: companies.map((c) => c.ownerId) }),
  })
    .select("email")
    .lean();
  const emailOf = new Map(owners.map((owner) => [owner._id.toString(), owner.email]));
  io.out(
    `${String(companies.length)} unverified ${companies.length === 1 ? "company" : "companies"}:`,
  );
  for (const company of companies) {
    const owner = emailOf.get(company.ownerId.toString()) ?? "unknown owner";
    const locked = company.verificationLockedReason
      ? `  lost the badge: ${company.verificationLockedReason}`
      : "";
    io.out(
      `${company._id.toString()}  ${company.slug}  ${company.name}  ${company.website}  ${owner}${locked}`,
    );
  }
}

/**
 * The only way back to `verified` for a company that lost the badge by a rename or domain move:
 * clears `verificationLockedReason` and records the website's domain as the one the badge vouches for.
 */
async function approveCompany([reference = ""]: readonly string[], io: AdminIo): Promise<void> {
  const company = await findCompany(reference);
  if (company.verification === "suspended") {
    throw new AdminError(`${company.name} is suspended; use unsuspend-company to restore it`);
  }
  if (company.verification === "verified") {
    io.out(`${company.name} is already verified`);
    return;
  }
  const verifiedDomain = registrableDomain(company.website);
  if (verifiedDomain === null) {
    throw new AdminError(`${company.name}'s website (${company.website}) has no company domain`);
  }
  if (await isDomainHeld(verifiedDomain)) {
    throw new AdminError(
      `${verifiedDomain} is held for a suspended company; see list-holds, and lift-hold first`,
    );
  }
  await Company.updateOne(
    { _id: company._id, verification: "unverified" },
    {
      $set: { verification: "verified", verifiedDomain },
      $unset: { verificationLockedReason: 1 },
    },
  );
  io.out(`Approved ${company.name} (${company.slug}): now verified for ${verifiedDomain}`);
}

async function suspendCompany([reference = ""]: readonly string[], io: AdminIo): Promise<void> {
  const company = await findCompany(reference);
  if (company.verification === "suspended") {
    io.out(`${company.name} is already suspended`);
    return;
  }
  await Company.updateOne({ _id: company._id }, { verification: "suspended" });
  // Held at once, before anything else can happen to the company, such as its owner leaving.
  await holdSuspendedCompany(company);
  io.out(`Suspended ${company.name} (${company.slug}); its jobs are now hidden`);
}

/**
 * Lifts the company's hold, then goes back to `verified` only if the company has no
 * `verificationLockedReason` and the owner's confirmed email still matches the website; else
 * `unverified`, waiting for approve-company.
 */
async function unsuspendCompany([reference = ""]: readonly string[], io: AdminIo): Promise<void> {
  const company = await findCompany(reference);
  if (company.verification !== "suspended")
    throw new AdminError(`${company.name} is not suspended`);
  await releaseHold(company._id);
  const owner = await User.findById(company.ownerId).select("email emailVerifiedAt").lean();
  const matches =
    company.verificationLockedReason === undefined &&
    owner?.emailVerifiedAt != null &&
    verificationForCompany(owner.email.slice(owner.email.lastIndexOf("@") + 1), company.website) ===
      "verified";
  const verifiedDomain = matches ? registrableDomain(company.website) : null;
  const verification = verifiedDomain === null ? "unverified" : "verified";
  await Company.updateOne(
    { _id: company._id, verification: "suspended" },
    { $set: { verification, ...(verifiedDomain !== null && { verifiedDomain }) } },
  );
  io.out(`Unsuspended ${company.name} (${company.slug}): now ${verification}`);
}

/** Every hold: id, domain, how many emails, and the company it is for or that it was deleted. */
async function listHolds(_args: readonly string[], io: AdminIo): Promise<void> {
  const holds = await EmployerHold.find().sort({ createdAt: 1 }).lean();
  if (holds.length === 0) {
    io.out("No employer holds");
    return;
  }
  const companies = await Company.find({
    _id: mongoose.trusted({ $in: holds.flatMap((hold) => hold.companyId ?? []) }),
  })
    .select("slug")
    .lean();
  const slugOf = new Map(companies.map((company) => [company._id.toString(), company.slug]));
  io.out(`${String(holds.length)} employer ${holds.length === 1 ? "hold" : "holds"}:`);
  for (const hold of holds) {
    const emails = hold.emailKeys.length;
    const slug = hold.companyId && slugOf.get(hold.companyId.toString());
    const owner = slug ? `company ${slug}` : "account deleted";
    const since = hold.createdAt.toISOString().slice(0, 10);
    io.out(
      `${hold._id.toString()}  ${hold.domain ?? "no domain"}  ${String(emails)} ${emails === 1 ? "email" : "emails"}  ${owner}  since ${since}`,
    );
  }
}

/**
 * Lifts holds by id or by domain, so their emails can open employer accounts and their domain can
 * verify companies again. A suspended company that still exists is lifted with unsuspend-company.
 */
async function liftHold([reference = ""]: readonly string[], io: AdminIo): Promise<void> {
  const filter = OBJECT_ID.test(reference) ? { _id: reference } : { domain: reference };
  const holds = await EmployerHold.find(filter).select("companyId").lean();
  if (holds.length === 0) throw new AdminError(`No hold matches "${reference}"`);
  if (holds.some((hold) => hold.companyId !== undefined)) {
    throw new AdminError(`"${reference}" is held for a suspended company; use unsuspend-company`);
  }
  const { deletedCount } = await EmployerHold.deleteMany(filter);
  io.out(`Lifted ${String(deletedCount)} ${deletedCount === 1 ? "hold" : "holds"}`);
}

const COMMANDS: Record<string, Command> = {
  migrate: { params: [], summary: "Build every index (run once per deploy)", run: migrate },
  "list-unverified": {
    params: [],
    summary: "List companies waiting for approval",
    run: listUnverified,
  },
  "approve-company": {
    params: ["id|slug"],
    summary: "Mark an unverified company as verified",
    run: approveCompany,
  },
  "suspend-company": {
    params: ["id|slug"],
    summary: "Hide a company and its jobs",
    run: suspendCompany,
  },
  "unsuspend-company": {
    params: ["id|slug"],
    summary: "Lift a suspension and re-check the owner's email domain, unless renamed or moved",
    run: unsuspendCompany,
  },
  "list-holds": {
    params: [],
    summary: "List the holds kept for suspended companies",
    run: listHolds,
  },
  "lift-hold": {
    params: ["id|domain"],
    summary: "Let a deleted suspended company's emails and domain back in",
    run: liftHold,
  },
};

const usage = (): string[] => [
  "Usage: npm run admin -- <command>",
  ...Object.entries(COMMANDS).map(
    ([name, { params, summary }]) =>
      `  ${[name, ...params.map((param) => `<${param}>`)].join(" ").padEnd(34)}${summary}`,
  ),
];

/** Runs one admin command on the open connection; returns the process exit code. */
export async function runAdmin(argv: readonly string[], io: AdminIo): Promise<number> {
  const [name = "", ...args] = argv;
  const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
  if (command?.params.length !== args.length) {
    for (const line of usage()) io.err(line);
    return 1;
  }
  try {
    await command.run(args, io);
    return 0;
  } catch (error) {
    if (!(error instanceof AdminError)) throw error;
    io.err(error.message);
    return 1;
  }
}
