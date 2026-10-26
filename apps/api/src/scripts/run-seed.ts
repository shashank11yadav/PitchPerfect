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
import { sanitizeJobHtml } from "../services/html-sanitizer.js";
import { checkPassword, PASSWORD_PROBLEM_MESSAGES } from "../services/password-policy.js";
import { hashPassword } from "../services/passwords.js";
import {
  DEMO_COMPANY,
  DEMO_JOBS,
  DEMO_ATTEMPTS,
  DEMO_EMPLOYER_EMAIL,
  DEMO_EMPLOYER_NAME,
  DEMO_STUDENT,
  DEMO_STUDENT_EMAIL,
  scorecardFor,
} from "./demo-data.js";
import {
  SEED_COMPANIES,
  SEED_JOBS,
  seedCompanySlug,
  seedJobSlug,
  type SeedCompany,
  type SeedJob,
} from "@pitchperfect/shared/seed-data";

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
      // Seeded students accepted the scripted partner's notice; against a live model they are
      // asked again before their first call.
      ...(role === "student" && {
        ageConfirmedAt: ctx.now,
        practiceConsentAt: ctx.now,
        practiceConsentPartner: "scripted",
      }),
    }),
  );
}

/**
 * The company, created with `owner` if it is missing. Its slug is fixed by the seed data, so a
 * re-run finds the same document.
 */
async function seedCompany(
  ctx: Context,
  seed: SeedCompany,
  owner: UserSpec,
): Promise<Types.ObjectId> {
  const slug = seedCompanySlug(seed);
  const id = await ensure(
    ctx.result.companies,
    Company.findOne({ slug }).select("_id").lean(),
    async () =>
      Company.create({
        ownerId: await ensureUser(ctx, owner),
        name: seed.name,
        slug,
        website: `https://${seed.host}`,
        pitch: seed.pitch,
        verification: seed.verification,
        ...(seed.verification === "verified" && { verifiedDomain: seed.host }),
      }),
  );
  await ensureEmployerProfile(id, seed.employer.jobTitle);
  return id;
}

/** Every company's owner needs a profile; also repairs a run that stopped half way. */
async function ensureEmployerProfile(companyId: Types.ObjectId, jobTitle: string): Promise<void> {
  if (await EmployerProfile.exists({ companyId })) return;
  const company = await Company.findById(companyId).select("ownerId").lean();
  if (company) await EmployerProfile.create({ userId: company.ownerId, jobTitle, companyId });
}

/** `company` indexes into `companies`, and `companyIds` holds their ids in the same order. */
async function seedJobs(
  ctx: Context,
  jobs: readonly SeedJob[],
  companies: readonly SeedCompany[],
  companyIds: readonly Types.ObjectId[],
): Promise<Types.ObjectId[]> {
  const ids: Types.ObjectId[] = [];
  for (const [index, seed] of jobs.entries()) {
    const company = companies[seed.company];
    const companyId = companyIds[seed.company];
    if (!company || !companyId) {
      throw new Error(`Seed job "${seed.title}" names a company that does not exist`);
    }
    const slug = seedJobSlug(seed, company);
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

/** The demo student, their two practice attempts, and an application to the demo company's first job. */
async function seedDemoStudent(ctx: Context, jobIds: readonly Types.ObjectId[]): Promise<void> {
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

  const jobId = jobIds[0];
  const seedJob = DEMO_JOBS[0];
  if (!jobId || !seedJob) throw new Error("The demo application names no job");
  await ensure(
    ctx.result.applications,
    Application.findOne({ jobId, studentId }).select("_id").lean(),
    () =>
      Application.create({
        jobId,
        studentId,
        jobSnapshot: { title: seedJob.title, companyName: DEMO_COMPANY.name },
        sharedAttemptId: attemptIds[0],
      }),
  );
}

/** The demo employer's own company and jobs, then the demo student. */
async function seedDemo(ctx: Context): Promise<void> {
  const companyId = await seedCompany(ctx, DEMO_COMPANY, {
    email: DEMO_EMPLOYER_EMAIL,
    role: "employer",
    name: DEMO_EMPLOYER_NAME,
    password: ctx.demoPassword,
  });
  const jobIds = await seedJobs(ctx, DEMO_JOBS, [DEMO_COMPANY], [companyId]);
  await seedDemoStudent(ctx, jobIds);
}

/**
 * Loads fictional companies, employers and jobs, plus (with `demo`) a demo employer with their own company, and a demo student.
 * Safe to repeat: documents are found by email, slug or fixed id, and anything that exists is left
 * exactly as it is, including passwords. Runs on the open Mongoose connection.
 */
export async function runSeed(options: SeedOptions): Promise<SeedResult> {
  const demoPassword = options.demo ? await assertDemoPassword(options.password) : undefined;

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

  const companyIds: Types.ObjectId[] = [];
  for (const seed of SEED_COMPANIES) {
    companyIds.push(
      await seedCompany(ctx, seed, {
        email: `hiring@${seed.host}`,
        role: "employer",
        name: seed.employer,
      }),
    );
  }
  await seedJobs(ctx, SEED_JOBS, SEED_COMPANIES, companyIds);
  if (options.demo) await seedDemo(ctx);
  return ctx.result;
}
