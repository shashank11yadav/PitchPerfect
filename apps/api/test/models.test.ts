import mongoose, { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { RUBRIC_KEYS, ScorecardSchema, SKILLS, type Scorecard } from "@pitchperfect/shared";
import {
  Application,
  AuthToken,
  Company,
  EmployerProfile,
  Job,
  PracticeAttempt,
  SavedJob,
  StudentProfile,
  UsageDay,
  User,
} from "../src/db/models/index.js";
import {
  toAttemptSummary,
  toAttemptView,
  toEmployerProfileView,
  toPublicCompany,
  toPublicJob,
  toPublicUser,
  toStudentProfileView,
} from "../src/db/mappers.js";
import { slugify } from "../src/db/slug.js";
import { useTestDb } from "./helpers/db.js";

useTestDb();

const oid = () => new Types.ObjectId();

const userInput = (email = "ada@example.test") => ({
  email,
  passwordHash: "$argon2id$fake",
  role: "student" as const,
  name: { first: "Ada", last: "Lovelace" },
});

const companyInput = (ownerId = oid(), slug = "acme-labs") => ({
  ownerId,
  name: "Acme Labs",
  slug,
  website: "https://acme.example.test",
  pitch: "We sell widgets.",
  verification: "verified" as const,
});

const jobInput = (companyId = oid(), slug = "sdr-a1b2c3") => ({
  companyId,
  slug,
  title: "SDR",
  location: "Boston, MA",
  workplace: "hybrid" as const,
  employmentType: "internship" as const,
  descriptionHtml: "<p>Call people.</p>",
  skills: ["calling"],
  pay: {
    type: "range" as const,
    min: 20,
    max: 30,
    currency: "USD" as const,
    frequency: "hourly" as const,
    commission: false,
  },
  status: "active" as const,
  publishedAt: new Date("2026-01-02T03:04:05.000Z"),
});

const scorecard: Scorecard = {
  overall: 70,
  dimensions: RUBRIC_KEYS.map((key) => ({
    key,
    score: 4 as const,
    justification: "Solid.",
    evidence: null,
  })),
  strengths: ["a", "b", "c"],
  improvements: ["d", "e", "f"],
  strongerLine: { original: "o", improved: "i" },
};

const attemptInput = (studentId = oid()) => ({
  studentId,
  skill: SKILLS[0]?.slug ?? "pitching",
  scenarioPublic: {
    personaName: "Dana",
    personaTitle: "Buyer",
    companyType: "SaaS",
    personality: "Busy",
    openingLine: "Hi, who is this?",
  },
  scenarioPrivate: { hiddenObjections: ["price", "timing"], winConditions: ["books a call"] },
  transcript: [{ role: "partner" as const, text: "Hi, who is this?", at: new Date() }],
  provider: "fake" as const,
  model: "fake-1",
  startedAt: new Date("2026-02-01T10:00:00.000Z"),
  expiresAt: new Date("2026-08-01T10:00:00.000Z"),
});

async function indexOf(model: mongoose.Model<never>, field: string) {
  const indexes = await model.collection.indexes();
  return indexes.find((index) => Object.keys(index.key).join(",") === field);
}

describe("indexes", () => {
  it("lowercases emails and enforces a unique email", async () => {
    await User.syncIndexes();
    const first = await User.create(userInput("A@x.io"));
    expect(first.email).toBe("a@x.io");

    await expect(User.create(userInput("a@x.io"))).rejects.toMatchObject({ code: 11000 });
  });

  it("enforces one application per job and student", async () => {
    await Application.syncIndexes();
    const jobId = oid();
    const studentId = oid();
    await Application.create({ jobId, studentId });

    await expect(Application.create({ jobId, studentId })).rejects.toMatchObject({ code: 11000 });
    await expect(Application.create({ jobId, studentId: oid() })).resolves.toBeDefined();
  });

  it("enforces one saved job per student and job", async () => {
    await SavedJob.syncIndexes();
    const ids = { studentId: oid(), jobId: oid() };
    await SavedJob.create(ids);

    await expect(SavedJob.create(ids)).rejects.toMatchObject({ code: 11000 });
  });

  it("enforces unique profile, company, job, token, and usage-day keys", async () => {
    await Promise.all(
      [StudentProfile, EmployerProfile, Company, Job, AuthToken, UsageDay].map((model) =>
        model.syncIndexes(),
      ),
    );
    const userId = oid();
    const profile = {
      userId,
      school: "State U",
      major: "Business",
      gradYear: 2027,
      targetRole: "SDR",
      industry: "SaaS",
      state: "MA" as const,
    };
    await StudentProfile.create(profile);
    await expect(StudentProfile.create(profile)).rejects.toMatchObject({ code: 11000 });

    const employer = { userId, jobTitle: "Founder", companyId: oid() };
    await EmployerProfile.create(employer);
    await expect(EmployerProfile.create({ ...employer, userId: oid() })).rejects.toMatchObject({
      code: 11000,
    });

    const ownerId = oid();
    await Company.create(companyInput(ownerId));
    await expect(Company.create(companyInput(oid()))).rejects.toMatchObject({ code: 11000 });
    await expect(Company.create(companyInput(ownerId, "other"))).rejects.toMatchObject({
      code: 11000,
    });

    await Job.create(jobInput());
    await expect(Job.create(jobInput())).rejects.toMatchObject({ code: 11000 });

    const token = {
      userId,
      type: "verify_email" as const,
      tokenHash: "h".repeat(64),
      expiresAt: new Date(),
    };
    await AuthToken.create(token);
    await expect(AuthToken.create(token)).rejects.toMatchObject({ code: 11000 });

    await UsageDay.create({ day: "2026-01-01" });
    await expect(UsageDay.create({ day: "2026-01-01" })).rejects.toMatchObject({ code: 11000 });
  });

  it("expires practice attempts at expiresAt via a TTL index", async () => {
    await PracticeAttempt.syncIndexes();

    const ttl = await indexOf(PracticeAttempt as never, "expiresAt");
    expect(ttl?.expireAfterSeconds).toBe(0);
    const history = await indexOf(PracticeAttempt as never, "studentId,startedAt");
    expect(history?.key).toEqual({ studentId: 1, startedAt: -1 });
  });

  it("expires auth tokens at expiresAt via a TTL index", async () => {
    await AuthToken.syncIndexes();

    const ttl = await indexOf(AuthToken as never, "expiresAt");
    expect(ttl?.expireAfterSeconds).toBe(0);
  });

  it("indexes jobs for listing and text search", async () => {
    await Job.syncIndexes();
    const indexes = await Job.collection.indexes();
    const keys = indexes.map((index) => Object.keys(index.key).join(","));

    expect(keys).toEqual(expect.arrayContaining(["companyId,status", "status,publishedAt"]));
    expect(indexes.some((index) => "_fts" in index.key)).toBe(true);
  });
});

describe("schema defaults and validation", () => {
  it("defaults arrays, flags, and timestamps", async () => {
    const profile = await StudentProfile.create({
      userId: oid(),
      school: "State U",
      major: "Business",
      gradYear: 2027,
      targetRole: "SDR",
      industry: "SaaS",
      state: "MA" as const,
    });
    const application = await Application.create({ jobId: oid(), studentId: oid() });
    const attempt = await PracticeAttempt.create(attemptInput());

    expect(profile.lessonsCompleted).toEqual([]);
    expect(application.status).toBe("applied");
    expect(application.savedByEmployer).toBe(false);
    expect(application.interview).toBeUndefined();
    expect(application.toJSON()).toHaveProperty("createdAt", expect.any(Date));
    expect(attempt.status).toBe("active");
    expect(attempt.guardFlags).toBe(0);
    expect(attempt.scorecard).toBeNull();
    expect(attempt.turnLockUntil).toBeNull();
    expect(attempt.tokens).toEqual({ input: 0, output: 0 });
  });

  it("rejects values outside the shared enums", async () => {
    await expect(User.create({ ...userInput(), role: "admin" as never })).rejects.toThrow(
      mongoose.Error.ValidationError,
    );
    await expect(
      Application.create({ jobId: oid(), studentId: oid(), status: "x" as never }),
    ).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it("stores a valid scorecard and rejects a malformed one", async () => {
    expect(ScorecardSchema.safeParse(scorecard).success).toBe(true);
    const attempt = await PracticeAttempt.create({ ...attemptInput(), scorecard });
    expect(attempt.scorecard).toEqual(scorecard);

    await expect(
      PracticeAttempt.create({ ...attemptInput(), scorecard: { overall: 500 } }),
    ).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it("keeps passwordHash and scenarioPrivate out of default queries and JSON", async () => {
    const created = await User.create(userInput());
    const attempt = await PracticeAttempt.create(attemptInput());

    const user = await User.findById(created._id);
    expect(user?.passwordHash).toBeUndefined();
    const withHash = await User.findById(created._id).select("+passwordHash");
    expect(withHash?.passwordHash).toBe("$argon2id$fake");
    expect(Object.keys(withHash?.toJSON() ?? {})).not.toContain("passwordHash");
    expect(Object.keys(withHash?.toJSON() ?? {})).not.toContain("__v");

    const found = await PracticeAttempt.findById(attempt._id);
    expect(found?.scenarioPrivate).toBeUndefined();
    expect(Object.keys(attempt.toJSON())).not.toContain("scenarioPrivate");
  });
});

describe("view mappers", () => {
  it("toPublicUser omits passwordHash and formats dates", async () => {
    const user = await User.create({
      ...userInput(),
      emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const view = toPublicUser(user);

    expect(view).toEqual({
      id: user.id,
      email: "ada@example.test",
      role: "student",
      firstName: "Ada",
      lastName: "Lovelace",
      emailVerifiedAt: "2026-01-01T00:00:00.000Z",
      practiceConsentAt: null,
    });
    expect(Object.keys(view)).not.toContain("passwordHash");
  });

  it("toPublicCompany and toPublicJob return plain public shapes", async () => {
    const company = await Company.create(companyInput());
    const job = await Job.create(jobInput(company._id));

    expect(toPublicCompany(company)).toEqual({
      id: company.id,
      name: "Acme Labs",
      slug: "acme-labs",
      website: "https://acme.example.test",
      linkedinUrl: null,
      pitch: "We sell widgets.",
      logoUrl: null,
      verification: "verified",
    });
    const view = toPublicJob(job, company);
    expect(view).toEqual({
      id: job.id,
      slug: "sdr-a1b2c3",
      title: "SDR",
      location: "Boston, MA",
      workplace: "hybrid",
      employmentType: "internship",
      pay: {
        type: "range",
        min: 20,
        max: 30,
        currency: "USD",
        frequency: "hourly",
        commission: false,
      },
      skills: ["calling"],
      publishedAt: "2026-01-02T03:04:05.000Z",
      descriptionHtml: "<p>Call people.</p>",
      company: { name: "Acme Labs", slug: "acme-labs", logoUrl: null, verification: "verified" },
    });
  });

  it("toPublicJob maps unpaid and exact pay without stray fields", async () => {
    const company = await Company.create(companyInput());
    const unpaid = await Job.create({ ...jobInput(company._id), pay: { type: "unpaid" } });
    const exact = await Job.create({
      ...jobInput(company._id, "x-1"),
      pay: { type: "exact", amount: 25, currency: "EUR", frequency: "weekly", commission: true },
    });

    expect(toPublicJob(unpaid, company).pay).toEqual({ type: "unpaid" });
    expect(toPublicJob(exact, company).pay).toEqual({
      type: "exact",
      amount: 25,
      currency: "EUR",
      frequency: "weekly",
      commission: true,
    });
  });

  it("toAttemptView never exposes scenarioPrivate, even from a hydrated document", async () => {
    const attempt = await PracticeAttempt.create(attemptInput());
    const view = toAttemptView(attempt);

    expect(Object.keys(view)).not.toContain("scenarioPrivate");
    expect(JSON.stringify(view)).not.toContain("hiddenObjections");
    expect(Object.keys(view)).not.toContain("_id");
    expect(Object.keys(view)).not.toContain("__v");
    expect(view).toMatchObject({
      id: attempt.id,
      skill: attempt.skill,
      jobId: null,
      status: "active",
      scorecard: null,
      startedAt: "2026-02-01T10:00:00.000Z",
      endedAt: null,
      expiresAt: "2026-08-01T10:00:00.000Z",
    });
    expect(view.transcript).toHaveLength(1);
    expect(view.transcript[0]).toMatchObject({ role: "partner", text: "Hi, who is this?" });
    expect(typeof view.transcript[0]?.at).toBe("string");
  });

  it("toAttemptView works on lean documents and includes the job id", async () => {
    const jobId = oid();
    const created = await PracticeAttempt.create({ ...attemptInput(), jobId, scorecard });
    const lean = await PracticeAttempt.findById(created._id).select("+scenarioPrivate").lean();
    if (!lean) throw new Error("attempt not found");
    const view = toAttemptView(lean);

    expect(view.jobId).toBe(jobId.toString());
    expect(view.scorecard).toEqual(scorecard);
    expect(JSON.stringify(view)).not.toContain("hiddenObjections");
  });

  it("toAttemptSummary reports the overall score", async () => {
    const attempt = await PracticeAttempt.create({
      ...attemptInput(),
      status: "completed",
      scorecard,
      endedAt: new Date("2026-02-01T10:05:00.000Z"),
    });

    expect(toAttemptSummary(attempt)).toEqual({
      id: attempt.id,
      skill: attempt.skill,
      status: "completed",
      overall: 70,
      startedAt: "2026-02-01T10:00:00.000Z",
      endedAt: "2026-02-01T10:05:00.000Z",
    });
    const open = await PracticeAttempt.create(attemptInput());
    expect(toAttemptSummary(open).overall).toBeNull();
  });

  it("maps profiles without leaking the résumé file id", async () => {
    const profile = await StudentProfile.create({
      userId: oid(),
      school: "State U",
      major: "Business",
      gradYear: 2027,
      targetRole: "SDR",
      industry: "SaaS",
      state: "MA" as const,
      resumeFileId: oid(),
      lessonsCompleted: ["pitching"],
    });
    const companyId = oid();
    const employer = await EmployerProfile.create({
      userId: oid(),
      jobTitle: "Founder",
      companyId,
    });

    expect(toStudentProfileView(profile)).toEqual({
      school: "State U",
      major: "Business",
      gradYear: 2027,
      targetRole: "SDR",
      industry: "SaaS",
      state: "MA" as const,
      hasResume: true,
      lessonsCompleted: ["pitching"],
    });
    expect(toEmployerProfileView(employer)).toEqual({
      jobTitle: "Founder",
      companyId: companyId.toString(),
    });
  });
});

describe("slugify", () => {
  it("lowercases, strips punctuation, and appends the suffix", () => {
    expect(slugify("Senior SDR — Boston!", "a1b2c3")).toBe("senior-sdr-boston-a1b2c3");
  });

  it("transliterates accents and collapses separators", () => {
    expect(slugify("  Café   Manager__(Remote) ", "zzzzzz")).toBe("cafe-manager-remote-zzzzzz");
  });

  it("caps the base at 60 characters without a trailing hyphen", () => {
    const slug = slugify(`${"a".repeat(59)} bbbbbb`, "a1b2c3");

    expect(slug).toBe(`${"a".repeat(59)}-a1b2c3`);
    expect(slug.length).toBeLessThanOrEqual(60 + 1 + 6);
  });

  it("falls back to the suffix when nothing ascii remains", () => {
    expect(slugify("!!! 日本語", "a1b2c3")).toBe("a1b2c3");
  });
});
