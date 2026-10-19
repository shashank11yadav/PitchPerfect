import { randomBytes } from "node:crypto";
import type { Types } from "mongoose";
import { LIMITS, PaySchema, type Role } from "@pitchperfect/shared";
import {
  Application,
  Company,
  EmployerProfile,
  Job,
  PracticeAttempt,
  StudentProfile,
  User,
} from "../db/models/index.js";
import { slugify } from "../db/slug.js";
import { sanitizeJobHtml } from "../services/html-sanitizer.js";
import { checkPassword, PASSWORD_PROBLEM_MESSAGES } from "../services/password-policy.js";
import { hashPassword } from "../services/passwords.js";
import {
  DEMO_APPLICATION_JOB,
  DEMO_ATTEMPTS,
  DEMO_EMPLOYER_EMAIL,
  DEMO_EMPLOYER_NAME,
  DEMO_STUDENT,
  DEMO_STUDENT_EMAIL,
  scorecardFor,
} from "./demo-data.js";
import { SEED_COMPANIES, SEED_JOBS } from "./seed-data.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const TURN_GAP_MS = 45_000;
const SESSION_MS = 6 * 60_000;

/** The seed cannot run as asked (bad password, demo accounts blocked). Its message is safe to print. */
export class SeedError extends Error {
  override name = "SeedError";
}

export interface SeedOptions {
  /** Also create the demo student and employer accounts and the student's history. */
  demo: boolean;
  /** Password for the demo accounts. Required with `demo`. Never printed or stored in clear. */
  password?: string;
  /** Days an attempt is kept (default: the product limit). */
  retentionDays?: number;
  /** The clock; defaults to the current time. */
  now?: Date;
}

interface Tally {
  created: number;
  existing: number;
}

export interface SeedResult {
  users: Tally;
  companies: Tally;
  jobs: Tally;
  attempts: Tally;
  applications: Tally;
}

interface HasId {
  _id: Types.ObjectId;
}

/** The id of the document `find` returns, or of the one `create` makes when there is none. */
async function ensure(
  tally: Tally,
  find: PromiseLike<HasId | null>,
  create: () => Promise<HasId>,
): Promise<Types.ObjectId> {
  const found = await find;
  if (found) {
    tally.existing += 1;
    return found._id;
  }
  const made = await create();
  tally.created += 1;
  return made._id;
}

/** Deterministic, so a re-run finds the same document: `northwind-analytics-demo01`. */
const seedSlug = (name: string, position: number) =>
  slugify(name, `demo${String(position).padStart(2, "0")}`);

async function assertDemoPassword(password: string | undefined): Promise<string> {
  if (password === undefined || password === "") {
    throw new SeedError("SEED_DEMO_PASSWORD is required when seeding with --demo");
  }
  const check = await checkPassword(
    password,
    { email: DEMO_STUDENT_EMAIL },
    { hibpEnabled: false },
  );
  if (!check.ok) {
    throw new SeedError(
      `SEED_DEMO_PASSWORD is not acceptable: ${PASSWORD_PROBLEM_MESSAGES[check.reason]}`,
    );
  }
  return password;
}

/** Fails before any write if the demo employer cannot take over the first company. */
async function assertDemoEmployerCanOwnFirstCompany(): Promise<void> {
  const [first] = SEED_COMPANIES;
  if (!first) return;
  const company = await Company.findOne({ slug: seedSlug(first.name, 1) })
    .select("ownerId")
    .lean();
  if (!company) return;
  const owner = await User.findById(company.ownerId).select("email").lean();
  if (owner?.email !== DEMO_EMPLOYER_EMAIL) {
    throw new SeedError(
      `${first.name} is already owned by another account, so the demo employer cannot own it. ` +
        "Seed with --demo from the start, or reset the database.",
    );
  }
}

interface Context {
  now: Date;
  retentionDays: number;
  demoPassword?: string;
  result: SeedResult;
}

interface UserSpec {
  email: string;
  role: Role;
  name: { first: string; last: string };
  /** Omitted for accounts nobody should be able to sign in to: they get a random one. */
  password?: string;
}

function ensureUser(ctx: Context, spec: UserSpec): Promise<Types.ObjectId> {
  const { email, role, name, password } = spec;
  return ensure(ctx.result.users, User.findOne({ email }).select("_id").lean(), async () =>
    User.create({
      email,
      role,
      name,
      passwordHash: await hashPassword(password ?? randomBytes(32).toString("base64url")),
      emailVerifiedAt: ctx.now,
      ...(role === "student" && { ageConfirmedAt: ctx.now, practiceConsentAt: ctx.now }),
    }),
  );
}

async function seedCompanies(ctx: Context): Promise<Types.ObjectId[]> {
  const ids: Types.ObjectId[] = [];
  for (const [index, seed] of SEED_COMPANIES.entries()) {
    const slug = seedSlug(seed.name, index + 1);
    const demoOwned = ctx.demoPassword !== undefined && index === 0;
    const id = await ensure(
      ctx.result.companies,
      Company.findOne({ slug }).select("_id").lean(),
      async () =>
        Company.create({
          ownerId: await ensureUser(
            ctx,
            demoOwned
              ? {
                  email: DEMO_EMPLOYER_EMAIL,
                  role: "employer",
                  name: DEMO_EMPLOYER_NAME,
                  password: ctx.demoPassword,
                }
              : { email: `hiring@${seed.host}`, role: "employer", name: seed.employer },
          ),
          name: seed.name,
          slug,
          website: `https://${seed.host}`,
          pitch: seed.pitch,
          verification: seed.verification,
        }),
    );
    ids.push(id);
    await ensureEmployerProfile(id, seed.employer.jobTitle);
  }
  return ids;
}

/** Every company's owner needs a profile; also repairs a run that stopped half way. */
async function ensureEmployerProfile(companyId: Types.ObjectId, jobTitle: string): Promise<void> {
  if (await EmployerProfile.exists({ companyId })) return;
  const company = await Company.findById(companyId).select("ownerId").lean();
  if (company) await EmployerProfile.create({ userId: company.ownerId, jobTitle, companyId });
}

async function seedJobs(ctx: Context, companyIds: Types.ObjectId[]): Promise<Types.ObjectId[]> {
  const ids: Types.ObjectId[] = [];
  for (const [index, seed] of SEED_JOBS.entries()) {
    const companyId = companyIds[seed.company];
    if (!companyId) throw new Error(`Seed job "${seed.title}" names a company that does not exist`);
    const slug = seedSlug(seed.title, index + 1);
    ids.push(
      await ensure(ctx.result.jobs, Job.findOne({ slug }).select("_id").lean(), () =>
        Job.create({
          companyId,
          slug,
          title: seed.title,
          location: seed.location,
          workplace: seed.workplace,
          employmentType: seed.employmentType,
          descriptionHtml: sanitizeJobHtml(seed.descriptionHtml),
          skills: seed.skills,
          pay: PaySchema.parse(seed.pay),
          status: seed.status,
          ...(seed.status !== "draft" && {
            publishedAt: new Date(ctx.now.getTime() - (2 + index * 2) * DAY_MS),
          }),
        }),
      ),
    );
  }
  return ids;
}

async function seedDemoStudent(ctx: Context, jobIds: Types.ObjectId[]): Promise<void> {
  const studentId = await ensureUser(ctx, {
    email: DEMO_STUDENT_EMAIL,
    role: "student",
    name: DEMO_STUDENT.name,
    password: ctx.demoPassword,
  });
  if (!(await StudentProfile.exists({ userId: studentId }))) {
    await StudentProfile.create({
      userId: studentId,
      ...DEMO_STUDENT.profile,
      lessonsCompleted: [...DEMO_STUDENT.profile.lessonsCompleted],
      gradYear: ctx.now.getUTCFullYear() + 1,
    });
  }

  const attemptIds: Types.ObjectId[] = [];
  for (const attempt of DEMO_ATTEMPTS) {
    const startedAt = new Date(ctx.now.getTime() - attempt.daysAgo * DAY_MS);
    const jobId = attempt.job === undefined ? undefined : jobIds[attempt.job];
    attemptIds.push(
      await ensure(
        ctx.result.attempts,
        PracticeAttempt.findById(attempt.id).select("_id").lean(),
        () =>
          PracticeAttempt.create({
            _id: attempt.id,
            studentId,
            skill: attempt.skill,
            ...(jobId && { jobId }),
            status: "completed",
            scenarioPublic: attempt.scenarioPublic,
            scenarioPrivate: attempt.scenarioPrivate,
            transcript: attempt.turns.map((text, turn) => ({
              role: turn % 2 === 0 ? "partner" : "student",
              text,
              at: new Date(startedAt.getTime() + turn * TURN_GAP_MS),
            })),
            scorecard: scorecardFor(attempt),
            provider: "fake",
            model: "fake",
            tokens: attempt.tokens,
            startedAt,
            endedAt: new Date(startedAt.getTime() + SESSION_MS),
            expiresAt: new Date(startedAt.getTime() + ctx.retentionDays * DAY_MS),
          }),
      ),
    );
  }

  const jobId = jobIds[DEMO_APPLICATION_JOB];
  const seedJob = SEED_JOBS[DEMO_APPLICATION_JOB];
  const seedCompany = seedJob && SEED_COMPANIES[seedJob.company];
  if (!jobId || !seedJob || !seedCompany) throw new Error("The demo application names no job");
  await ensure(
    ctx.result.applications,
    Application.findOne({ jobId, studentId }).select("_id").lean(),
    () =>
      Application.create({
        jobId,
        studentId,
        jobSnapshot: { title: seedJob.title, companyName: seedCompany.name },
        sharedAttemptId: attemptIds[0],
      }),
  );
}

/**
 * Loads fictional companies, employers and jobs, plus (with `demo`) a demo student and employer.
 * Safe to repeat: documents are found by email, slug or fixed id, and anything that exists is left
 * exactly as it is, including passwords. Runs on the open Mongoose connection.
 */
export async function runSeed(options: SeedOptions): Promise<SeedResult> {
  const demoPassword = options.demo ? await assertDemoPassword(options.password) : undefined;
  if (options.demo) await assertDemoEmployerCanOwnFirstCompany();

  const tally = (): Tally => ({ created: 0, existing: 0 });
  const ctx: Context = {
    now: options.now ?? new Date(),
    retentionDays: options.retentionDays ?? LIMITS.attemptRetentionDays,
    ...(demoPassword !== undefined && { demoPassword }),
    result: {
      users: tally(),
      companies: tally(),
      jobs: tally(),
      attempts: tally(),
      applications: tally(),
    },
  };

  const companyIds = await seedCompanies(ctx);
  const jobIds = await seedJobs(ctx, companyIds);
  if (options.demo) await seedDemoStudent(ctx, jobIds);
  return ctx.result;
}
