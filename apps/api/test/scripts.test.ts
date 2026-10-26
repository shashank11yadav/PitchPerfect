import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import {
  computeOverall,
  getSkill,
  LIMITS,
  PaySchema,
  ScorecardSchema,
  slugify,
} from "@pitchperfect/shared";
import {
  Application,
  AuthToken,
  Company,
  EmployerProfile,
  Job,
  PracticeAttempt,
  PracticeStart,
  StudentProfile,
  User,
} from "../src/db/models/index.js";
import { saveResume } from "../src/services/files.js";
import { sanitizeJobHtml } from "../src/services/html-sanitizer.js";
import { verifyPassword } from "../src/services/passwords.js";
import { runAdmin, type AdminIo } from "../src/scripts/run-admin.js";
import { runPurge } from "../src/scripts/run-purge.js";
import { runSeed, SeedError } from "../src/scripts/run-seed.js";
import { useTestDb } from "./helpers/db.js";
import {
  createApplication,
  createAttempt,
  createEmployer,
  createJob,
  createStarts,
  createStudent,
} from "./helpers/factories.js";
import { tinyPdf } from "./helpers/pdf.js";

useTestDb();

const DEMO_PASSWORD = "copper-meadow-signal-48";
const OTHER_PASSWORD = "walnut-garden-lattice-17";
const DEMO_STUDENT = "student@pitchperfect.example";
const DEMO_EMPLOYER = "employer@pitchperfect.example";

const countAll = async () => ({
  users: await User.countDocuments(),
  companies: await Company.countDocuments(),
  employerProfiles: await EmployerProfile.countDocuments(),
  studentProfiles: await StudentProfile.countDocuments(),
  jobs: await Job.countDocuments(),
  attempts: await PracticeAttempt.countDocuments(),
  applications: await Application.countDocuments(),
});

describe("runSeed", () => {
  it("yields the same counts when run twice", async () => {
    const first = await runSeed({ demo: true, password: DEMO_PASSWORD });
    const afterFirst = await countAll();
    const second = await runSeed({ demo: true, password: DEMO_PASSWORD });

    expect(await countAll()).toEqual(afterFirst);
    expect(first.companies).toEqual({ created: 7, existing: 0 });
    expect(first.jobs).toEqual({ created: 16, existing: 0 });
    expect(second.companies).toEqual({ created: 0, existing: 7 });
    expect(second.jobs).toEqual({ created: 0, existing: 16 });
    expect(first.users.created).toBe(8);
    expect(second.users.created).toBe(0);
    expect(second.attempts).toEqual({ created: 0, existing: 2 });
    expect(second.applications).toEqual({ created: 0, existing: 1 });
  });

  it("creates seven fictional companies (six plus the demo one), one per employer, one of them unverified", async () => {
    await runSeed({ demo: true, password: DEMO_PASSWORD });

    const companies = await Company.find().lean();
    expect(companies).toHaveLength(7);
    expect(companies.filter((c) => c.verification === "unverified")).toHaveLength(1);
    expect(companies.filter((c) => c.verification === "verified")).toHaveLength(6);
    for (const company of companies) {
      expect(new URL(company.website).hostname).toMatch(/\.example$/);
      // Named like a real company page: the host's first label, "zentrova-analytics".
      expect(company.slug).toBe(new URL(company.website).hostname.split(".")[0]);
      expect(company.pitch).not.toMatch(/made[- ]up|demo/i);
      expect(await EmployerProfile.countDocuments({ companyId: company._id })).toBe(1);
    }
    const employers = await User.find({ role: "employer" }).lean();
    expect(employers).toHaveLength(7);
    expect(employers.every((u) => u.emailVerifiedAt instanceof Date)).toBe(true);
  });

  it("creates 16 valid jobs with sanitized descriptions and deterministic slugs", async () => {
    await runSeed({ demo: true, password: DEMO_PASSWORD });
    const slugs = (await Job.find().lean()).map((job) => job.slug).sort();
    await Job.deleteMany({});
    await Company.deleteMany({});
    await User.deleteMany({});
    await EmployerProfile.deleteMany({});
    await runSeed({ demo: true, password: DEMO_PASSWORD });

    const jobs = await Job.find().lean();
    const companySlugs = new Map(
      (await Company.find().lean()).map((company) => [company._id.toString(), company.slug]),
    );
    expect(jobs.map((job) => job.slug).sort()).toEqual(slugs);
    expect(jobs).toHaveLength(16);
    expect(jobs.filter((job) => job.status === "draft")).toHaveLength(1);
    expect(jobs.filter((job) => job.status === "archived")).toHaveLength(1);
    expect(jobs.filter((job) => job.status === "active")).toHaveLength(14);
    expect(new Set(jobs.map((job) => job.workplace)).size).toBeGreaterThan(1);
    expect(new Set(jobs.map((job) => job.employmentType)).size).toBeGreaterThan(1);
    for (const job of jobs) {
      // The title and the company, as a job board names a listing.
      expect(job.slug).toBe(slugify(job.title, companySlugs.get(job.companyId.toString()) ?? ""));
      expect(job.descriptionHtml).not.toMatch(/made[- ]up/i);
      expect(PaySchema.safeParse(job.pay).success).toBe(true);
      expect(job.descriptionHtml).toBe(sanitizeJobHtml(job.descriptionHtml));
      expect(job.descriptionHtml.length).toBeGreaterThan(40);
      if (job.status !== "draft") expect(job.publishedAt).toBeInstanceOf(Date);
      else expect(job.publishedAt).toBeUndefined();
    }
  });

  it("puts no real mail provider or non-example domain into any seeded document", async () => {
    await runSeed({ demo: true, password: DEMO_PASSWORD });

    const documents = [
      ...(await User.find().lean()),
      ...(await Company.find().lean()),
      ...(await Job.find().lean()),
      ...(await PracticeAttempt.find().select("+scenarioPrivate").lean()),
      ...(await Application.find().lean()),
      ...(await StudentProfile.find().lean()),
    ];
    const text = JSON.stringify(documents);
    expect(text).not.toMatch(/@(gmail|yahoo|outlook|hotmail|icloud)\./i);
    expect(text).not.toContain(DEMO_PASSWORD);
    for (const user of await User.find().lean())
      expect(user.email).toMatch(/@[a-z0-9.-]+\.example$/);
  });

  it("creates the two demo accounts with the supplied password", async () => {
    await runSeed({ demo: true, password: DEMO_PASSWORD });

    const student = await User.findOne({ email: DEMO_STUDENT }).select("+passwordHash").lean();
    const employer = await User.findOne({ email: DEMO_EMPLOYER }).select("+passwordHash").lean();
    expect(student?.role).toBe("student");
    expect(employer?.role).toBe("employer");
    for (const user of [student, employer]) {
      expect(user?.emailVerifiedAt).toBeInstanceOf(Date);
      expect(await verifyPassword(user?.passwordHash ?? "", DEMO_PASSWORD)).toBe(true);
    }
    expect(student?.ageConfirmedAt).toBeInstanceOf(Date);
    expect(student?.practiceConsentAt).toBeInstanceOf(Date);
    expect(student?.practiceConsentPartner).toBe("scripted");
    expect(await StudentProfile.countDocuments({ userId: student?._id })).toBe(1);
    // The demo employer owns its own verified company and sees the demo student's application.
    const profile = await EmployerProfile.findOne({ userId: employer?._id }).lean();
    const company = await Company.findById(profile?.companyId).lean();
    expect(company?.verification).toBe("verified");
    expect(company?.website).toBe("https://lanecrest.example");
    expect(company?.ownerId.toString()).toBe(employer?._id.toString());
    expect(await Job.countDocuments({ companyId: company?._id, status: "active" })).toBe(2);
    const application = await Application.findOne().lean();
    const job = await Job.findById(application?.jobId).lean();
    expect(job?.companyId.toString()).toBe(company?._id.toString());
  });

  it("gives other employers a password nobody knows", async () => {
    await runSeed({ demo: true, password: DEMO_PASSWORD });

    const others = (await User.find({ role: "employer" }).select("+passwordHash").lean()).filter(
      (user) => user.email !== DEMO_EMPLOYER,
    );
    expect(others).toHaveLength(6);
    for (const user of others) {
      expect(user.email).toMatch(/^hiring@/);
      expect(await verifyPassword(user.passwordHash, DEMO_PASSWORD)).toBe(false);
    }
  });

  it("stores two consistent, completed practice attempts and one shared application", async () => {
    await runSeed({ demo: true, password: DEMO_PASSWORD, retentionDays: 90 });

    const student = await User.findOne({ email: DEMO_STUDENT }).lean();
    const attempts = await PracticeAttempt.find({ studentId: student?._id }).lean();
    expect(attempts).toHaveLength(2);
    for (const attempt of attempts) {
      expect(attempt.status).toBe("completed");
      expect(attempt.provider).toBe("fake");
      expect(attempt.transcript.length).toBeGreaterThanOrEqual(6);
      expect(attempt.transcript.length).toBeLessThanOrEqual(8);
      expect(attempt.expiresAt.getTime() - attempt.startedAt.getTime()).toBe(
        90 * 24 * 60 * 60 * 1000,
      );
      const scorecard = ScorecardSchema.parse(attempt.scorecard);
      expect(scorecard.overall).toBe(
        computeOverall(scorecard.dimensions, getSkill(attempt.skill).weighted),
      );
      const studentText = attempt.transcript
        .filter((entry) => entry.role === "student")
        .map((entry) => entry.text)
        .join("\n");
      expect(attempt.transcript[0]?.role).toBe("partner");
      expect(attempt.transcript[0]?.text).toBe(attempt.scenarioPublic.openingLine);
      for (const dimension of scorecard.dimensions) {
        if (dimension.evidence !== null) expect(studentText).toContain(dimension.evidence);
      }
      expect(studentText).toContain(scorecard.strongerLine.original);
    }

    const applications = await Application.find().lean();
    expect(applications).toHaveLength(1);
    const [application] = applications;
    expect(attempts.map((a) => a._id.toString())).toContain(
      application?.sharedAttemptId?.toString(),
    );
    const job = await Job.findById(application?.jobId).lean();
    const company = await Company.findById(job?.companyId).lean();
    expect(application?.jobSnapshot).toEqual({ title: job?.title, companyName: company?.name });
    expect(application?.studentId.toString()).toBe(student?._id.toString());
  });

  it("uses the default retention when none is given", async () => {
    await runSeed({ demo: true, password: DEMO_PASSWORD });
    const attempt = await PracticeAttempt.findOne().lean();
    const days = (attempt?.expiresAt.getTime() ?? 0) - (attempt?.startedAt.getTime() ?? 0);
    expect(days).toBe(LIMITS.attemptRetentionDays * 24 * 60 * 60 * 1000);
  });

  it("does not change the password of an account that already exists", async () => {
    await runSeed({ demo: true, password: DEMO_PASSWORD });
    await runSeed({ demo: true, password: OTHER_PASSWORD });

    const student = await User.findOne({ email: DEMO_STUDENT }).select("+passwordHash").lean();
    expect(await verifyPassword(student?.passwordHash ?? "", DEMO_PASSWORD)).toBe(true);
    expect(await verifyPassword(student?.passwordHash ?? "", OTHER_PASSWORD)).toBe(false);
  });

  it("creates only what is missing", async () => {
    await runSeed({ demo: true, password: DEMO_PASSWORD });
    await Job.deleteOne({ status: "draft" });
    await Application.deleteMany({});

    const result = await runSeed({ demo: true, password: DEMO_PASSWORD });

    expect(result.jobs).toEqual({ created: 1, existing: 15 });
    expect(result.applications).toEqual({ created: 1, existing: 0 });
    expect(await Job.countDocuments()).toBe(16);
  });

  it("seeds companies, jobs and employers without demo accounts when demo is off", async () => {
    const result = await runSeed({ demo: false });

    expect(result.companies.created).toBe(6);
    expect(result.jobs.created).toBe(14);
    expect(await Company.countDocuments()).toBe(6);
    expect(result.attempts.created).toBe(0);
    expect(await User.countDocuments({ role: "student" })).toBe(0);
    expect(await User.findOne({ email: DEMO_EMPLOYER })).toBeNull();
    expect(await User.countDocuments({ role: "employer" })).toBe(6);
    expect(await Application.countDocuments()).toBe(0);
  });

  it.each([
    ["is missing", undefined],
    ["is empty", ""],
    ["is too short", "short-pw-1"],
    ["is a common password", "password1234"],
  ])("refuses --demo when the password %s, writing nothing", async (_label, password) => {
    const attempt = runSeed({ demo: true, ...(password === undefined ? {} : { password }) });

    await expect(attempt).rejects.toBeInstanceOf(SeedError);
    await expect(attempt).rejects.toThrow(/SEED_DEMO_PASSWORD/);
    expect(await countAll()).toEqual(
      Object.fromEntries(Object.keys(await countAll()).map((key) => [key, 0])),
    );
  });

  it("never echoes the password in an error", async () => {
    const weak = "password1234";
    const error = await runSeed({ demo: true, password: weak }).catch((e: unknown) => e);
    expect((error as Error).message).not.toContain(weak);
  });

  it("adds only the demo parts when --demo follows a plain seed", async () => {
    await runSeed({ demo: false });
    const before = await countAll();

    const result = await runSeed({ demo: true, password: DEMO_PASSWORD });

    expect(result.companies).toEqual({ created: 1, existing: 6 });
    expect(result.jobs).toEqual({ created: 2, existing: 14 });
    expect(result.attempts.created).toBe(2);
    expect(result.applications.created).toBe(1);
    expect(await countAll()).toEqual({
      users: before.users + 2,
      companies: before.companies + 1,
      employerProfiles: before.employerProfiles + 1,
      studentProfiles: before.studentProfiles + 1,
      jobs: before.jobs + 2,
      attempts: 2,
      applications: 1,
    });
    const first = await Company.findOne({ slug: "zentrova-analytics" }).lean();
    const owner = await User.findById(first?.ownerId).lean();
    expect(owner?.email).toMatch(/^hiring@/);
  });

  it("re-seeding without demo after a demo seed adds nothing", async () => {
    await runSeed({ demo: true, password: DEMO_PASSWORD });
    const before = await countAll();

    const result = await runSeed({ demo: false });

    expect(await countAll()).toEqual(before);
    expect(result.users.created).toBe(0);
    expect(result.companies.created).toBe(0);
  });
});

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  const io: AdminIo = { out: (line) => out.push(line), err: (line) => err.push(line) };
  return { io, out, err, text: () => out.join("\n") };
}

describe("runAdmin", () => {
  it("prints usage and fails for no command, an unknown command, or a missing argument", async () => {
    for (const argv of [
      [],
      ["bogus"],
      ["approve-company"],
      ["suspend-company"],
      ["unsuspend-company"],
    ]) {
      const run = capture();
      expect(await runAdmin(argv, run.io)).toBe(1);
      expect(run.err.join("\n")).toMatch(/usage/i);
    }
  });

  it("rejects extra arguments", async () => {
    const run = capture();
    expect(await runAdmin(["list-unverified", "extra"], run.io)).toBe(1);
    expect(run.err.join("\n")).toMatch(/usage/i);
  });

  it("migrate rebuilds missing indexes and leaves the TTL indexes in place", async () => {
    await PracticeAttempt.collection.dropIndexes();
    await AuthToken.collection.dropIndexes();
    await Company.collection.dropIndexes();
    const run = capture();

    expect(await runAdmin(["migrate"], run.io)).toBe(0);

    const ttl = async (model: typeof PracticeAttempt | typeof AuthToken) =>
      (await model.collection.indexes()).find((index) => index.key.expiresAt === 1);
    expect((await ttl(PracticeAttempt))?.expireAfterSeconds).toBe(0);
    expect((await ttl(AuthToken))?.expireAfterSeconds).toBe(0);
    const companyIndexes = await Company.collection.indexes();
    expect(companyIndexes.find((index) => index.key.slug === 1)?.unique).toBe(true);
    expect(run.text()).toMatch(/practiceattempts/i);
    expect(run.text()).toMatch(/practicestarts/i);
  });

  it("list-unverified shows only unverified companies with their owners", async () => {
    const pending = await createEmployer({ companyVerified: false, companyName: "Pending Co" });
    await createEmployer({ companyVerified: true, companyName: "Trusted Co" });
    const suspended = await createEmployer({ companyName: "Paused Co" });
    await Company.updateOne({ _id: suspended.company._id }, { verification: "suspended" });
    const run = capture();

    expect(await runAdmin(["list-unverified"], run.io)).toBe(0);

    const text = run.text();
    expect(text).toContain("Pending Co");
    expect(text).toContain(pending.company.slug);
    expect(text).toContain(pending.company._id.toString());
    expect(text).toContain(pending.email);
    expect(text).not.toContain("Trusted Co");
    expect(text).not.toContain("Paused Co");
  });

  it("list-unverified says so when there are none", async () => {
    const run = capture();
    expect(await runAdmin(["list-unverified"], run.io)).toBe(0);
    expect(run.text()).toMatch(/no unverified companies/i);
  });

  it("approve-company flips an unverified company to verified, by slug or id", async () => {
    const bySlug = await createEmployer({ companyVerified: false });
    const byId = await createEmployer({ companyVerified: false });

    expect(await runAdmin(["approve-company", bySlug.company.slug], capture().io)).toBe(0);
    expect(await runAdmin(["approve-company", byId.company._id.toString()], capture().io)).toBe(0);

    expect((await Company.findById(bySlug.company._id).lean())?.verification).toBe("verified");
    expect((await Company.findById(byId.company._id).lean())?.verification).toBe("verified");
  });

  it("approve-company fails for an unknown company and refuses a suspended one", async () => {
    const missing = capture();
    expect(await runAdmin(["approve-company", "no-such-company"], missing.io)).toBe(1);
    expect(missing.err.join("\n")).toMatch(/no company/i);
    expect(
      await runAdmin(["approve-company", new mongoose.Types.ObjectId().toString()], capture().io),
    ).toBe(1);

    const { company } = await createEmployer();
    await Company.updateOne({ _id: company._id }, { verification: "suspended" });
    const run = capture();
    expect(await runAdmin(["approve-company", company.slug], run.io)).toBe(1);
    expect(run.err.join("\n")).toMatch(/unsuspend-company/);
    expect((await Company.findById(company._id).lean())?.verification).toBe("suspended");
  });

  it("suspend-company suspends any company, and is harmless to repeat", async () => {
    const { company } = await createEmployer();

    expect(await runAdmin(["suspend-company", company.slug], capture().io)).toBe(0);
    expect((await Company.findById(company._id).lean())?.verification).toBe("suspended");
    expect(await runAdmin(["suspend-company", company.slug], capture().io)).toBe(0);
    expect((await Company.findById(company._id).lean())?.verification).toBe("suspended");
  });

  it("unsuspend-company restores verified when the owner's confirmed email matches the website", async () => {
    const { company, user } = await createEmployer({
      email: "talent@acme-demo.example",
      website: "https://www.acme-demo.example",
    });
    await Company.updateOne({ _id: company._id }, { verification: "suspended" });

    expect(await runAdmin(["unsuspend-company", company.slug], capture().io)).toBe(0);

    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    expect((await Company.findById(company._id).lean())?.verification).toBe("verified");
  });

  it("unsuspend-company falls back to unverified when the domains differ or the email is unconfirmed", async () => {
    const mismatch = await createEmployer({
      email: "talent@somewhere-else.example",
      website: "https://www.acme-demo.example",
    });
    const unconfirmed = await createEmployer({
      email: "talent@acme-demo.example",
      website: "https://www.acme-demo.example",
      verified: false,
    });
    for (const { company } of [mismatch, unconfirmed]) {
      await Company.updateOne({ _id: company._id }, { verification: "suspended" });
      expect(await runAdmin(["unsuspend-company", company.slug], capture().io)).toBe(0);
      expect((await Company.findById(company._id).lean())?.verification).toBe("unverified");
    }
  });

  it("unsuspend-company fails for a company that is not suspended", async () => {
    const { company } = await createEmployer();
    const run = capture();

    expect(await runAdmin(["unsuspend-company", company.slug], run.io)).toBe(1);
    expect(run.err.join("\n")).toMatch(/not suspended/i);
    expect((await Company.findById(company._id).lean())?.verification).toBe("verified");
  });
});

const NOW = new Date("2026-10-19T12:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const daysAhead = (days: number) => new Date(NOW.getTime() + days * 24 * 60 * 60_000);

async function createToken(userId: mongoose.Types.ObjectId, hash: string, fields: object) {
  return AuthToken.create({
    userId,
    type: "verify_email",
    tokenHash: hash,
    expiresAt: daysAhead(1),
    ...fields,
  });
}

describe("runPurge", () => {
  it("deletes expired attempts and keeps fresh ones", async () => {
    const student = await createStudent();
    const expired = await createAttempt(student.user._id);
    const fresh = await createAttempt(student.user._id);
    await PracticeAttempt.updateOne({ _id: expired._id }, { expiresAt: minutesAgo(1) });
    await PracticeAttempt.updateOne({ _id: fresh._id }, { expiresAt: daysAhead(30) });

    const result = await runPurge(NOW);

    expect(result.attemptsDeleted).toBe(1);
    expect(await PracticeAttempt.findById(expired._id)).toBeNull();
    expect(await PracticeAttempt.findById(fresh._id)).not.toBeNull();
  });

  it("deletes expired and used tokens and keeps live unused ones", async () => {
    const { user } = await createStudent();
    await createToken(user._id, "expired", { expiresAt: minutesAgo(5) });
    await createToken(user._id, "used", { usedAt: minutesAgo(5) });
    await createToken(user._id, "live", {});

    const result = await runPurge(NOW);

    expect(result.tokensDeleted).toBe(2);
    expect((await AuthToken.find().lean()).map((token) => token.tokenHash)).toEqual(["live"]);
  });

  it("abandons active attempts past the session limit plus an hour of grace", async () => {
    const { user } = await createStudent();
    const graceMinutes = LIMITS.sessionSeconds / 60 + 60;
    const stale = await createAttempt(user._id);
    // A student has at most one live attempt, so the second active one belongs to someone else.
    const justInside = await createAttempt((await createStudent()).user._id);
    const finished = await createAttempt(user._id);
    await PracticeAttempt.updateOne(
      { _id: stale._id },
      {
        status: "active",
        startedAt: minutesAgo(graceMinutes + 1),
        expiresAt: daysAhead(30),
        turnLockUntil: daysAhead(1),
      },
    );
    await PracticeAttempt.updateOne(
      { _id: justInside._id },
      { status: "active", startedAt: minutesAgo(graceMinutes - 1), expiresAt: daysAhead(30) },
    );
    await PracticeAttempt.updateOne(
      { _id: finished._id },
      { status: "completed", startedAt: minutesAgo(graceMinutes * 3), expiresAt: daysAhead(30) },
    );

    const result = await runPurge(NOW);

    expect(result.attemptsAbandoned).toBe(1);
    const reload = async (id: mongoose.Types.ObjectId) => PracticeAttempt.findById(id).lean();
    expect((await reload(stale._id))?.status).toBe("abandoned");
    expect((await reload(stale._id))?.turnLockUntil).toBeNull();
    expect((await reload(justInside._id))?.status).toBe("active");
    expect((await reload(finished._id))?.status).toBe("completed");
  });

  it("deletes start placeholders older than five minutes and gives their sessions back", async () => {
    const placeholder = async (minutes: number) => {
      const { user } = await createStudent();
      await createStarts(user._id, 1, minutesAgo(minutes));
      return PracticeAttempt.create({
        studentId: user._id,
        skill: "pitching",
        status: "starting",
        startedAt: minutesAgo(minutes),
        expiresAt: daysAhead(30),
      });
    };
    const crashed = await placeholder(6);
    const planning = await placeholder(4);

    const result = await runPurge(NOW);

    expect(result.placeholdersDeleted).toBe(1);
    expect(await PracticeAttempt.findById(crashed._id)).toBeNull();
    expect(await PracticeAttempt.findById(planning._id)).not.toBeNull();
    const startsOf = async (studentId: mongoose.Types.ObjectId) =>
      (await PracticeStart.findOne({ studentId }).lean())?.starts;
    expect(await startsOf(crashed.studentId)).toBe(0);
    expect(await startsOf(planning.studentId)).toBe(1);
  });

  it("deletes an attempt that is both expired and stale instead of abandoning it", async () => {
    const { user } = await createStudent();
    const attempt = await createAttempt(user._id);
    await PracticeAttempt.updateOne(
      { _id: attempt._id },
      { status: "active", startedAt: minutesAgo(1000), expiresAt: minutesAgo(1) },
    );

    const result = await runPurge(NOW);

    expect(result).toMatchObject({ attemptsDeleted: 1, attemptsAbandoned: 0 });
    expect(await PracticeAttempt.countDocuments()).toBe(0);
  });

  it("detaches a purged attempt from the application that shared it", async () => {
    const student = await createStudent();
    const employer = await createEmployer();
    const job = await Job.create({
      companyId: employer.company._id,
      slug: "sdr-abc123",
      title: "SDR",
      location: "Boston, MA",
      workplace: "remote",
      employmentType: "full_time",
      descriptionHtml: "<p>Fictional.</p>",
      pay: { type: "unpaid" },
      status: "active",
    });
    const attempt = await createAttempt(student.user._id);
    await PracticeAttempt.updateOne({ _id: attempt._id }, { expiresAt: minutesAgo(1) });
    const application = await createApplication({
      jobId: job._id,
      studentId: student.user._id,
      sharedAttemptId: attempt._id,
    });

    const result = await runPurge(NOW);

    expect(result.sharesCleared).toBe(1);
    const reloaded = await Application.findById(application._id).lean();
    expect(reloaded?.sharedAttemptId).toBeUndefined();
    expect(reloaded?.status).toBe("applied");
  });

  it("deletes résumé copies once the employer's access window has passed", async () => {
    const { company } = await createEmployer();
    const job = await createJob(company._id);
    const graceMinutes = LIMITS.resumeAccessGraceDays * 24 * 60;
    const withCopy = async (status: "shortlisted" | "rejected" | "closed", ended: Date) => {
      const { user } = await createStudent();
      const application = await createApplication({
        jobId: job._id,
        studentId: user._id,
        status,
        resumeFileId: await saveResume(user._id, tinyPdf()),
      });
      // Older applications have no `endedAt`; their last change stands in for it.
      const set = status === "closed" ? { updatedAt: ended } : { endedAt: ended, updatedAt: ended };
      await Application.updateOne({ _id: application._id }, { $set: set }, { timestamps: false });
      return application._id;
    };
    const expired = await withCopy("rejected", minutesAgo(graceMinutes + 1));
    const olderExpired = await withCopy("closed", minutesAgo(graceMinutes + 1));
    const recent = await withCopy("rejected", minutesAgo(graceMinutes - 1));
    const open = await withCopy("shortlisted", minutesAgo(graceMinutes * 3));

    const result = await runPurge(NOW);

    expect(result.resumesRemoved).toBe(2);
    const copyOf = async (id: mongoose.Types.ObjectId) =>
      (await Application.findById(id).lean())?.resumeFileId;
    expect(await copyOf(expired)).toBeNull();
    expect(await copyOf(olderExpired)).toBeNull();
    expect(await copyOf(recent)).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(await copyOf(open)).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(await mongoose.connection.collection("resumes.files").countDocuments()).toBe(2);
    expect((await runPurge(NOW)).resumesRemoved).toBe(0);
  });

  it("reports zero counts on an empty database and is safe to repeat", async () => {
    const empty = {
      attemptsDeleted: 0,
      attemptsAbandoned: 0,
      tokensDeleted: 0,
      sharesCleared: 0,
      placeholdersDeleted: 0,
      resumesRemoved: 0,
    };
    expect(await runPurge(NOW)).toEqual(empty);
    expect(await runPurge(NOW)).toEqual(empty);
  });
});
