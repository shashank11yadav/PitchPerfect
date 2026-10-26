import { slugify, utcMonth } from "@pitchperfect/shared";
import mongoose from "mongoose";
import {
  Application,
  Company,
  EmployerProfile,
  Job,
  PracticeAttempt,
  PracticeStart,
  StudentProfile,
  User,
} from "../../src/db/models/index.js";
import type { ApplicationAttrs } from "../../src/db/models/application.js";
import type { JobAttrs } from "../../src/db/models/job.js";
import type { PracticeAttemptAttrs } from "../../src/db/models/practice-attempt.js";
import { registrableDomain } from "../../src/services/company-verification.js";
import { sanitizeJobHtml } from "../../src/services/html-sanitizer.js";
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
  const website = options.website ?? "https://www.acme-demo.example";
  const verified = options.companyVerified !== false;
  const company = await Company.create({
    ownerId: account.user._id,
    name,
    slug: slugify(name, uniqueId().slice(-6)),
    website,
    verification: verified ? "verified" : "unverified",
    verifiedDomain: verified ? (registrableDomain(website) ?? undefined) : undefined,
  });
  const profile = await EmployerProfile.create({
    userId: account.user._id,
    jobTitle: "Head of talent",
    companyId: company._id,
  });
  return { ...account, company, profile };
}

/** A job posted by `company`: active and published now unless `opts` say otherwise. */
export function createJob(
  companyId: mongoose.Types.ObjectId,
  opts: Partial<Omit<JobAttrs, "companyId">> = {},
) {
  const title = opts.title ?? "Sales development rep";
  return Job.create({
    companyId,
    slug: slugify(title, uniqueId().slice(-6)),
    title,
    location: "Boston, MA",
    workplace: "remote",
    employmentType: "full_time",
    descriptionHtml: sanitizeJobHtml("<p>Fictional role for tests.</p>"),
    pay: { type: "unpaid" },
    status: "active",
    publishedAt: new Date(),
    ...opts,
  });
}

/** An application with the job snapshot every new application carries. */
export function createApplication(
  input: {
    jobId: mongoose.Types.ObjectId;
    studentId: mongoose.Types.ObjectId;
  } & Partial<ApplicationAttrs>,
) {
  return Application.create({
    jobSnapshot: { title: "Sales development rep", companyName: "Acme Demo Co" },
    ...input,
  });
}

/**
 * `turns` student lines, each answered by the partner 30 s later, starting at `startedAt`: what
 * a call with that many scored turns stores.
 */
export function practiceTranscript(turns: number, startedAt: Date = new Date()) {
  const at = (step: number) => new Date(startedAt.getTime() + step * 30_000);
  return Array.from({ length: turns }, (_, index) => [
    {
      role: "student" as const,
      text: `Fictional student line ${String(index + 1)}.`,
      at: at(2 * index + 1),
      flagged: false,
    },
    { role: "partner" as const, text: "Go on.", at: at(2 * index + 2), flagged: false },
  ]).flat();
}

/**
 * A finished practice attempt for `studentId` with four scored turns (the fewest that can be
 * shared), unless `overrides` say otherwise.
 */
export function createAttempt(
  studentId: mongoose.Types.ObjectId,
  overrides: Partial<PracticeAttemptAttrs> = {},
) {
  const startedAt = overrides.startedAt ?? new Date();
  return PracticeAttempt.create({
    studentId,
    skill: "pitching",
    status: "completed",
    scenarioPublic: {
      personaName: "Dana",
      personaTitle: "Buyer",
      companyType: "SaaS",
      personality: "Busy",
      openingLine: "Hi, who is this?",
    },
    scenarioPrivate: { hiddenObjections: ["price", "timing"], winConditions: ["books a call"] },
    provider: "fake",
    model: "fake-1",
    // Set here rather than by the schema default, which reads the clock before fake timers.
    startedAt,
    transcript: practiceTranscript(4, startedAt),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    ...overrides,
  });
}

/** `count` session starts in the student's quota ledger, as if made at `at`. */
export async function createStarts(
  studentId: mongoose.Types.ObjectId,
  count: number,
  at: Date = new Date(),
) {
  const day = at.toISOString().slice(0, 10);
  await PracticeStart.updateOne(
    { studentId, month: day.slice(0, 7) },
    {
      $inc: { starts: count, [`days.${day}`]: count },
      $setOnInsert: { expiresAt: utcMonth(at, 1) },
    },
    { upsert: true },
  );
}

/** `tokens` of practice usage in the student's ledger, as if spent at `at`. */
export async function createTokenUse(
  studentId: mongoose.Types.ObjectId,
  tokens: number,
  at: Date = new Date(),
) {
  const day = at.toISOString().slice(0, 10);
  await PracticeStart.updateOne(
    { studentId, month: day.slice(0, 7) },
    { $inc: { [`tokens.${day}`]: tokens }, $setOnInsert: { expiresAt: utcMonth(at, 1) } },
    { upsert: true },
  );
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
