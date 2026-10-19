import mongoose from "mongoose";
import { Company, EmployerProfile, StudentProfile, User } from "../../src/db/models/index.js";
import { slugify } from "../../src/db/slug.js";
import { hashPassword } from "../../src/services/passwords.js";
import { withCsrf, type CsrfAgent, type TestAgent } from "./csrf.js";

/** Passes the password policy; fixtures only, never a real credential. */
export const TEST_PASSWORD = "violet-harbor-lantern-93";

const uniqueId = () => new mongoose.Types.ObjectId().toString();

interface AccountOptions {
  email?: string;
  password?: string;
  /** Email verified (default true). */
  verified?: boolean;
  firstName?: string;
}

async function createUser(role: "student" | "employer", options: AccountOptions) {
  const email = (options.email ?? `${role}-${uniqueId()}@example.test`).toLowerCase();
  const password = options.password ?? TEST_PASSWORD;
  const user = await User.create({
    email,
    passwordHash: await hashPassword(password),
    role,
    name: { first: options.firstName ?? "Taylor", last: "Example" },
    emailVerifiedAt: options.verified === false ? undefined : new Date(),
    ageConfirmedAt: role === "student" ? new Date() : undefined,
  });
  return { user, email, password };
}

/** A student with a profile, inserted directly (no signup route, no email). */
export async function createStudent(options: AccountOptions = {}) {
  const account = await createUser("student", options);
  const profile = await StudentProfile.create({
    userId: account.user._id,
    school: "Example State University",
    major: "Marketing",
    gradYear: new Date().getUTCFullYear() + 1,
    targetRole: "Sales development rep",
    industry: "Software",
    state: "MA",
  });
  return { ...account, profile };
}

interface EmployerOptions extends AccountOptions {
  /** Company verification (default true). */
  companyVerified?: boolean;
  companyName?: string;
  website?: string;
}

/** An employer with a profile and an owned company, inserted directly. */
export async function createEmployer(options: EmployerOptions = {}) {
  const account = await createUser("employer", options);
  const name = options.companyName ?? "Acme Demo Co";
  const company = await Company.create({
    ownerId: account.user._id,
    name,
    slug: slugify(name, uniqueId().slice(-6)),
    website: options.website ?? "https://www.acme-demo.example",
    verification: options.companyVerified === false ? "unverified" : "verified",
  });
  const profile = await EmployerProfile.create({
    userId: account.user._id,
    jobTitle: "Head of talent",
    companyId: company._id,
  });
  return { ...account, company, profile };
}

/** Signs `agent` in through the real route; returns the agent with a CSRF token for the new session. */
export async function signIn(
  agent: TestAgent,
  email: string,
  password: string,
): Promise<CsrfAgent> {
  const anonymous = await withCsrf(agent);
  await anonymous.post("/api/auth/signin").send({ email, password }).expect(200);
  return withCsrf(agent);
}
