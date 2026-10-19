import mongoose from "mongoose";
import * as models from "../db/models/index.js";
import { AuthToken, Company, PracticeAttempt, User } from "../db/models/index.js";
import { verificationForCompany } from "../services/company-verification.js";

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
const TTL_MODELS = [PracticeAttempt, AuthToken];

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
  io.out("TTL indexes present on practiceattempts and authtokens");
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
    io.out(
      `${company._id.toString()}  ${company.slug}  ${company.name}  ${company.website}  ${owner}`,
    );
  }
}

async function approveCompany([reference = ""]: readonly string[], io: AdminIo): Promise<void> {
  const company = await findCompany(reference);
  if (company.verification === "suspended") {
    throw new AdminError(`${company.name} is suspended; use unsuspend-company to restore it`);
  }
  if (company.verification === "verified") {
    io.out(`${company.name} is already verified`);
    return;
  }
  await Company.updateOne(
    { _id: company._id, verification: "unverified" },
    { verification: "verified" },
  );
  io.out(`Approved ${company.name} (${company.slug}): now verified`);
}

async function suspendCompany([reference = ""]: readonly string[], io: AdminIo): Promise<void> {
  const company = await findCompany(reference);
  if (company.verification === "suspended") {
    io.out(`${company.name} is already suspended`);
    return;
  }
  await Company.updateOne({ _id: company._id }, { verification: "suspended" });
  io.out(`Suspended ${company.name} (${company.slug}); its jobs are now hidden`);
}

/** Back to `verified` only if the owner's confirmed email still matches the website; else `unverified`. */
async function unsuspendCompany([reference = ""]: readonly string[], io: AdminIo): Promise<void> {
  const company = await findCompany(reference);
  if (company.verification !== "suspended")
    throw new AdminError(`${company.name} is not suspended`);
  const owner = await User.findById(company.ownerId).select("email emailVerifiedAt").lean();
  const matches =
    owner?.emailVerifiedAt != null &&
    verificationForCompany(owner.email.slice(owner.email.lastIndexOf("@") + 1), company.website) ===
      "verified";
  const verification = matches ? "verified" : "unverified";
  await Company.updateOne({ _id: company._id, verification: "suspended" }, { verification });
  io.out(`Unsuspended ${company.name} (${company.slug}): now ${verification}`);
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
    summary: "Lift a suspension and re-check the owner's email domain",
    run: unsuspendCompany,
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
