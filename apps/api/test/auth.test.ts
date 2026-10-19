import argon2 from "argon2";
import type { Router } from "express";
import mongoose from "mongoose";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthToken,
  Company,
  EmployerProfile,
  StudentProfile,
  User,
} from "../src/db/models/index.js";
import { requireVerified } from "../src/middleware/auth.js";
import { bumpSessionVersion } from "../src/modules/auth/service.js";
import { hashPassword } from "../src/services/passwords.js";
import { makeTestApp } from "./helpers/app.js";
import { csrfAgent, TEST_ORIGIN, withCsrf, type CsrfAgent } from "./helpers/csrf.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import { createEmployer, createStudent, signIn, TEST_PASSWORD } from "./helpers/factories.js";

useTestDb();

afterEach(() => {
  vi.useRealTimers();
});

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const NEW_PASSWORD = "copper-meadow-signal-58";

function extraRoutes(router: Router): void {
  router.get("/__test/verified", requireVerified, (_req, res) => {
    res.json({ ok: true });
  });
}

const { app, mailer } = makeTestApp({ extraRoutes });

afterEach(() => {
  mailer.sent.length = 0;
  mailer.failing = false;
});

const studentSignup = (overrides: Record<string, unknown> = {}) => ({
  role: "student",
  firstName: "Avery",
  lastName: "Example",
  email: "avery.student@example.test",
  password: TEST_PASSWORD,
  school: "Example State University",
  major: "Marketing",
  gradYear: new Date().getUTCFullYear() + 1,
  targetRole: "Sales development rep",
  industry: "Software",
  state: "MA",
  ageConfirmed: true,
  ...overrides,
});

const employerSignup = (overrides: Record<string, unknown> = {}) => ({
  role: "employer",
  firstName: "Jane",
  lastName: "Example",
  email: "jane@acme-demo.com",
  password: TEST_PASSWORD,
  jobTitle: "Head of talent",
  company: { name: "Acme Demo Co", website: "https://www.acme-demo.com" },
  ...overrides,
});

async function signup(body: object, agent?: CsrfAgent) {
  return (agent ?? (await csrfAgent(app))).post("/api/auth/signup").send(body);
}

function cookieHeader(res: { headers: Record<string, unknown> }, name: string): string | undefined {
  const cookies = (res.headers["set-cookie"] ?? []) as string[];
  return cookies.filter((cookie) => cookie.startsWith(`${name}=`)).at(-1);
}

/** The token from the first link to `path` in the most recent email. */
function tokenFromLastEmail(path: string): string {
  const text = mailer.sent.at(-1)?.text ?? "";
  const match = new RegExp(`${TEST_ORIGIN}${path}\\?token=([A-Za-z0-9_-]+)`).exec(text);
  if (!match?.[1]) throw new Error(`no ${path} link in the last email`);
  return match[1];
}

/** The error envelope without the per-request id, for comparing two responses. */
function errorWithoutId(res: { body: unknown }) {
  const { code, message, fields } = errorOf(res);
  return { code, message, fields };
}

/** Every key at any depth of a JSON value. */
function deepKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(deepKeys);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, inner]) => [key, ...deepKeys(inner)]);
}

describe("POST /api/auth/signup", () => {
  it("creates a student and profile, emails a verification link, and does not sign in", async () => {
    const res = await signup(studentSignup({ email: "  Avery.Student@Example.TEST " }));

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
    expect(cookieHeader(res, "pp.sid")).toBeUndefined();

    const user = await User.findOne().select("+passwordHash").lean();
    expect(user?.email).toBe("avery.student@example.test");
    expect(user?.role).toBe("student");
    expect(user?.emailVerifiedAt).toBeUndefined();
    expect(user?.ageConfirmedAt).toBeInstanceOf(Date);
    expect(user?.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);

    const profile = await StudentProfile.findOne({ userId: user?._id }).lean();
    expect(profile).toMatchObject({ school: "Example State University", state: "MA" });

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe("avery.student@example.test");
    expect(tokenFromLastEmail("/verify-email")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await AuthToken.countDocuments({ type: "verify_email" })).toBe(1);
  });

  it("creates the company unverified, even when the email domain matches the website", async () => {
    const res = await signup(employerSignup());
    expect(res.status).toBe(201);

    const user = await User.findOne().lean();
    const company = await Company.findOne().lean();
    const profile = await EmployerProfile.findOne().lean();
    // The address isn't confirmed yet, so the domain match proves nothing until verify-email.
    expect(company?.verification).toBe("unverified");
    expect(company?.ownerId.toString()).toBe(user?._id.toString());
    expect(company?.slug).toMatch(/^acme-demo-co-[a-z0-9]{6}$/);
    expect(company?.website).toBe("https://www.acme-demo.com");
    expect(profile?.companyId.toString()).toBe(company?._id.toString());
    expect(profile?.jobTitle).toBe("Head of talent");
    expect(mailer.sent).toHaveLength(1);
  });

  it("leaves the company unverified for a free-mail address", async () => {
    expect((await signup(employerSignup({ email: "jane.demo@gmail.com" }))).status).toBe(201);
    expect((await Company.findOne().lean())?.verification).toBe("unverified");
  });

  it("creates a separate company with a different slug for a repeated company name", async () => {
    expect((await signup(employerSignup())).status).toBe(201);
    expect((await signup(employerSignup({ email: "sam@other-demo.com" }))).status).toBe(201);

    const companies = await Company.find().lean();
    expect(companies).toHaveLength(2);
    expect(companies[0]?.slug).not.toBe(companies[1]?.slug);
    expect(companies.map((company) => company.verification)).toEqual(["unverified", "unverified"]);
  });

  it("answers an existing email with the same 201 and warns that address instead", async () => {
    const { user } = await createStudent({ email: "taken@example.test" });
    const before = await User.findById(user._id).select("+passwordHash").lean();

    const res = await signup(
      studentSignup({ email: "Taken@Example.test", password: NEW_PASSWORD }),
    );

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
    expect(cookieHeader(res, "pp.sid")).toBeUndefined();
    expect(await User.countDocuments()).toBe(1);
    expect(await StudentProfile.countDocuments()).toBe(1);
    expect(await AuthToken.countDocuments()).toBe(0);
    const after = await User.findById(user._id).select("+passwordHash").lean();
    expect(after?.passwordHash).toBe(before?.passwordHash);

    expect(mailer.sent).toHaveLength(1);
    const warning = mailer.sent[0];
    expect(warning?.to).toBe("taken@example.test");
    expect(warning?.text).toContain(`${TEST_ORIGIN}/signin`);
    expect(warning?.text).toContain(`${TEST_ORIGIN}/forgot-password`);
    expect(warning?.text).not.toContain("verify-email");
  });

  it("answers an existing employer email the same way without creating a company", async () => {
    await createEmployer({ email: "jane@acme-demo.com" });
    const res = await signup(employerSignup());

    expect(res.status).toBe(201);
    expect(await Company.countDocuments()).toBe(1);
    expect(mailer.sent[0]?.text).toContain(`${TEST_ORIGIN}/forgot-password`);
  });

  it.each([
    ["an admin role", studentSignup({ role: "admin" })],
    ["an extra key", studentSignup({ isAdmin: true })],
    ["a query operator as the email", studentSignup({ email: { $gt: "" } })],
    ["a mass-assigned verification", employerSignup({ verification: "verified" })],
    ["a student without age confirmation", studentSignup({ ageConfirmed: false })],
  ])("rejects %s with 400 and creates nothing", async (_label, body) => {
    const res = await signup(body);

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe("validation_failed");
    expect(await User.countDocuments()).toBe(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it("rejects a breached password the same way for new and existing emails", async () => {
    await createStudent({ email: "taken@example.test" });

    const fresh = await signup(studentSignup({ password: "password1234" }));
    const taken = await signup(
      studentSignup({ email: "taken@example.test", password: "password1234" }),
    );

    expect(fresh.status).toBe(400);
    expect(errorOf(fresh).code).toBe("validation_failed");
    expect(errorOf(fresh).fields).toHaveProperty("password");
    expect(errorWithoutId(taken)).toEqual(errorWithoutId(fresh));
    expect(await User.countDocuments()).toBe(1);
    expect(mailer.sent).toHaveLength(0);
  });

  it("still answers 201 when the verification email can't be sent", async () => {
    mailer.failing = true;
    const res = await signup(studentSignup());

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
    expect(await User.countDocuments()).toBe(1);
  });

  it("allows 3 signups per hour per IP, then 429", async () => {
    const agent = await csrfAgent(app);
    for (let i = 0; i < 3; i++) {
      const res = await signup(studentSignup({ email: `s${String(i)}@example.test` }), agent);
      expect(res.status).toBe(201);
    }
    const res = await signup(studentSignup({ email: "s3@example.test" }), agent);

    expect(res.status).toBe(429);
    expect(errorOf(res).code).toBe("rate_limited");
    expect(Number(res.get("retry-after"))).toBeGreaterThan(0);
  });

  it("refuses a signed-in user with 403 forbidden and creates nothing", async () => {
    const { email, password } = await createStudent();
    const session = await signIn(request.agent(app), email, password);

    const res = await session
      .post("/api/auth/signup")
      .send(studentSignup({ email: "second@example.test" }));

    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("forbidden");
    expect(await User.countDocuments()).toBe(1);
    expect(mailer.sent).toHaveLength(0);
  });

  it("requires a CSRF token", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .set("Origin", TEST_ORIGIN)
      .send(studentSignup());
    expect(errorOf(res).code).toBe("csrf_failed");
  });
});

describe("POST /api/auth/verify-email", () => {
  async function signupAndGetToken() {
    expect((await signup(studentSignup())).status).toBe(201);
    return tokenFromLastEmail("/verify-email");
  }

  it("verifies the email once; reusing the token is 400 invalid_token", async () => {
    const token = await signupAndGetToken();
    const agent = await csrfAgent(app);

    const res = await agent.post("/api/auth/verify-email").send({ token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect((await User.findOne().lean())?.emailVerifiedAt).toBeInstanceOf(Date);

    const reuse = await agent.post("/api/auth/verify-email").send({ token });
    expect(reuse.status).toBe(400);
    expect(errorOf(reuse).code).toBe("invalid_token");
  });

  async function verifyEmployer(overrides: Record<string, unknown> = {}) {
    expect((await signup(employerSignup(overrides))).status).toBe(201);
    const token = tokenFromLastEmail("/verify-email");
    return (await csrfAgent(app)).post("/api/auth/verify-email").send({ token });
  }

  it("verifies the employer's company once the matching email is confirmed", async () => {
    expect((await verifyEmployer()).status).toBe(200);
    expect((await Company.findOne().lean())?.verification).toBe("verified");
  });

  it.each([
    ["a free-mail address", { email: "jane.demo@gmail.com" }],
    ["a different domain", { email: "jane@other-demo.com" }],
  ])("keeps the company unverified for %s", async (_label, overrides) => {
    expect((await verifyEmployer(overrides)).status).toBe(200);
    expect((await Company.findOne().lean())?.verification).toBe("unverified");
  });

  it("never changes a suspended company", async () => {
    expect((await signup(employerSignup())).status).toBe(201);
    const token = tokenFromLastEmail("/verify-email");
    await Company.updateOne({}, { $set: { verification: "suspended" } });

    await (await csrfAgent(app)).post("/api/auth/verify-email").send({ token }).expect(200);

    expect((await Company.findOne().lean())?.verification).toBe("suspended");
    expect((await User.findOne().lean())?.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("rejects a token after 24 hours", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const token = await signupAndGetToken();
    vi.setSystemTime(Date.now() + 25 * HOUR_MS);

    const res = await (await csrfAgent(app)).post("/api/auth/verify-email").send({ token });

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe("invalid_token");
    expect((await User.findOne().lean())?.emailVerifiedAt).toBeUndefined();
  });

  it("rejects unknown tokens and non-string tokens", async () => {
    await signupAndGetToken();
    const agent = await csrfAgent(app);

    const unknown = await agent.post("/api/auth/verify-email").send({ token: "x".repeat(43) });
    expect(errorOf(unknown).code).toBe("invalid_token");
    const operator = await agent.post("/api/auth/verify-email").send({ token: { $ne: "" } });
    expect(operator.status).toBe(400);
    expect(errorOf(operator).code).toBe("validation_failed");
    expect((await User.findOne().lean())?.emailVerifiedAt).toBeUndefined();
  });
});

describe("POST /api/auth/resend-verification", () => {
  it("sends a fresh link to a signed-in, unverified user and retires the old one", async () => {
    await signup(studentSignup());
    const oldToken = tokenFromLastEmail("/verify-email");
    const session = await signIn(request.agent(app), "avery.student@example.test", TEST_PASSWORD);

    const res = await session.post("/api/auth/resend-verification").send();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mailer.sent).toHaveLength(2);
    const newToken = tokenFromLastEmail("/verify-email");
    expect(newToken).not.toBe(oldToken);
    const stale = await session.post("/api/auth/verify-email").send({ token: oldToken });
    expect(errorOf(stale).code).toBe("invalid_token");
    await session.post("/api/auth/verify-email").send({ token: newToken }).expect(200);
  });

  it("does nothing for an already verified user", async () => {
    const { email, password } = await createStudent();
    const session = await signIn(request.agent(app), email, password);

    await session.post("/api/auth/resend-verification").send().expect(200);
    expect(mailer.sent).toHaveLength(0);
  });

  it("requires a session", async () => {
    const res = await (await csrfAgent(app)).post("/api/auth/resend-verification").send();
    expect(res.status).toBe(401);
  });

  it("allows 3 per hour per user, then 429", async () => {
    const { email, password } = await createStudent({ verified: false });
    const session = await signIn(request.agent(app), email, password);
    for (let i = 0; i < 3; i++) {
      await session.post("/api/auth/resend-verification").send().expect(200);
    }
    const res = await session.post("/api/auth/resend-verification").send();
    expect(res.status).toBe(429);
  });
});

describe("POST /api/auth/signin", () => {
  it("signs in with the right password and sets pp.sid, returning only the public user", async () => {
    const { user, email } = await createStudent({ email: "riley@example.test" });
    const agent = await csrfAgent(app);

    const res = await agent
      .post("/api/auth/signin")
      .send({ email: "  Riley@Example.TEST", password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: {
        id: user.id,
        email,
        role: "student",
        firstName: "Taylor",
        lastName: "Example",
        emailVerifiedAt: user.emailVerifiedAt?.toISOString(),
        practiceConsentAt: null,
      },
    });
    expect(cookieHeader(res, "pp.sid")).toMatch(/^pp\.sid=s%3A/);
    expect(deepKeys(res.body)).not.toContain("passwordHash");
  });

  it("answers a wrong password and an unknown email identically", async () => {
    const { email } = await createStudent();
    const agent = await csrfAgent(app);

    const wrong = await agent.post("/api/auth/signin").send({ email, password: NEW_PASSWORD });
    const unknown = await agent
      .post("/api/auth/signin")
      .send({ email: "nobody@example.test", password: NEW_PASSWORD });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(errorOf(wrong).code).toBe("invalid_credentials");
    expect(errorWithoutId(wrong)).toEqual(errorWithoutId(unknown));
    expect(Object.keys(wrong.headers).sort()).toEqual(Object.keys(unknown.headers).sort());
    expect(cookieHeader(wrong, "pp.sid")).toBeUndefined();
  });

  it("still runs an argon2 verification for an unknown email", async () => {
    const verify = vi.spyOn(argon2, "verify");
    try {
      const res = await (
        await csrfAgent(app)
      )
        .post("/api/auth/signin")
        .send({ email: "nobody@example.test", password: NEW_PASSWORD });

      expect(res.status).toBe(401);
      expect(verify).toHaveBeenCalledTimes(1);
      const [hash, password] = verify.mock.calls[0] ?? [];
      expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
      expect(password).toBe(NEW_PASSWORD);
    } finally {
      verify.mockRestore();
    }
  });

  it("signs in a user stored before sessionVersion existed and keeps them signed in", async () => {
    const email = "legacy@example.test";
    const { insertedId } = await mongoose.connection.collection("users").insertOne({
      email,
      passwordHash: await hashPassword(TEST_PASSWORD),
      role: "student",
      name: { first: "Legacy", last: "Example" },
      emailVerifiedAt: new Date(),
    });
    await StudentProfile.create({
      userId: insertedId,
      school: "Example State University",
      major: "Marketing",
      gradYear: new Date().getUTCFullYear() + 1,
      targetRole: "Sales development rep",
      industry: "Software",
      state: "MA",
    });

    const session = await signIn(request.agent(app), email, TEST_PASSWORD);

    await session.agent.get("/api/auth/me").expect(200);
    await session.agent.get("/api/auth/me").expect(200);
  });

  it("issues a new session id on sign-in and the previous one stops working (no fixation)", async () => {
    const { email, password } = await createStudent();
    const agent = request.agent(app);

    const first = await signIn(agent, email, password);
    const firstMe = await first.agent.get("/api/auth/me").expect(200);
    const firstSid = /pp\.sid=([^;]+)/.exec(cookieHeader(firstMe, "pp.sid") ?? "")?.[1];

    const second = await first.post("/api/auth/signin").send({ email, password });
    const secondSid = /pp\.sid=([^;]+)/.exec(cookieHeader(second, "pp.sid") ?? "")?.[1];

    expect(firstSid).toBeDefined();
    expect(secondSid).toBeDefined();
    expect(secondSid).not.toBe(firstSid);
    const replay = await request(app)
      .get("/api/auth/me")
      .set("Cookie", `pp.sid=${firstSid ?? ""}`);
    expect(replay.status).toBe(401);
  });

  it("lets an unverified user sign in but not use verified-only routes", async () => {
    const { email, password } = await createStudent({ verified: false });
    const session = await signIn(request.agent(app), email, password);

    const me = await session.agent.get("/api/auth/me").expect(200);
    expect((me.body as { user: { emailVerifiedAt: unknown } }).user.emailVerifiedAt).toBeNull();
    const gated = await session.agent.get("/api/__test/verified");
    expect(gated.status).toBe(403);
    expect(errorOf(gated).code).toBe("email_not_verified");
  });

  it("allows 5 attempts per minute per IP and email, then 429 with Retry-After", async () => {
    const { email, password } = await createStudent();
    const agent = await csrfAgent(app);
    for (let i = 0; i < 5; i++) {
      await agent.post("/api/auth/signin").send({ email, password: NEW_PASSWORD }).expect(401);
    }

    const blocked = await agent.post("/api/auth/signin").send({ email, password });
    expect(blocked.status).toBe(429);
    expect(errorOf(blocked).code).toBe("rate_limited");
    const retryAfter = Number(blocked.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);

    // Another email from the same address has its own budget.
    const other = await createStudent();
    await agent
      .post("/api/auth/signin")
      .send({ email: other.email, password: other.password })
      .expect(200);
  });

  it("counts email variants as the same key and never stores the email in rate-limit keys", async () => {
    const { email } = await createStudent({ email: "casey@example.test" });
    const agent = await csrfAgent(app);
    for (const variant of ["casey@example.test", "CASEY@example.test", " Casey@Example.Test "]) {
      await agent.post("/api/auth/signin").send({ email: variant, password: NEW_PASSWORD });
    }
    await agent.post("/api/auth/signin").send({ email, password: NEW_PASSWORD });
    await agent.post("/api/auth/signin").send({ email, password: NEW_PASSWORD });
    const res = await agent.post("/api/auth/signin").send({ email, password: NEW_PASSWORD });
    expect(res.status).toBe(429);

    const ids = (await mongoose.connection.collection("ratelimits").find().toArray()).map((doc) =>
      String(doc._id),
    );
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.join(" ")).not.toMatch(/casey/i);
  });

  it("rejects query operators in credentials", async () => {
    await createStudent();
    const res = await (
      await csrfAgent(app)
    )
      .post("/api/auth/signin")
      .send({ email: { $gt: "" }, password: { $gt: "" } });
    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe("validation_failed");
  });
});

describe("POST /api/auth/signout", () => {
  it("destroys the session and clears the cookie", async () => {
    const { email, password } = await createStudent();
    const session = await signIn(request.agent(app), email, password);

    const res = await session.post("/api/auth/signout").send();

    expect(res.status).toBe(204);
    expect(cookieHeader(res, "pp.sid")).toMatch(/^pp\.sid=;/);
    expect(await mongoose.connection.collection("sessions").countDocuments()).toBe(0);
    await session.agent.get("/api/auth/me").expect(401);
  });

  it("answers 204 without a session", async () => {
    const res = await (await csrfAgent(app)).post("/api/auth/signout").send();
    expect(res.status).toBe(204);
  });

  it("answers 204 with a session past the absolute limit", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { email, password } = await createStudent();
    const agent = request.agent(app);
    await signIn(agent, email, password);
    vi.setSystemTime(Date.now() + 6 * DAY_MS);
    await agent.get("/api/auth/me").expect(200);
    vi.setSystemTime(Date.now() + 25 * DAY_MS);

    // The token was bound to the old session; anonymous now, so fetch a fresh one.
    const res = await (await withCsrf(agent)).post("/api/auth/signout").send();
    expect(res.status).toBe(204);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the student, their profile, and no company", async () => {
    const { email, password, user } = await createStudent();
    const session = await signIn(request.agent(app), email, password);

    const res = await session.agent.get("/api/auth/me").expect(200);
    const body = res.body as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual(["profile", "user"]);
    expect(body.user).toMatchObject({ id: user.id, role: "student", email });
    expect(body.profile).toMatchObject({ school: "Example State University", hasResume: false });
    expect(deepKeys(body)).not.toContain("passwordHash");
  });

  it("returns the employer, their profile, and their company", async () => {
    const { email, password, company } = await createEmployer({ companyVerified: false });
    const session = await signIn(request.agent(app), email, password);

    const res = await session.agent.get("/api/auth/me").expect(200);
    const body = res.body as Record<string, unknown>;

    expect(body.profile).toEqual({ jobTitle: "Head of talent", companyId: company.id });
    expect(body.company).toMatchObject({
      id: company.id,
      name: "Acme Demo Co",
      verification: "unverified",
    });
    expect(deepKeys(body)).not.toContain("passwordHash");
    expect(deepKeys(body)).not.toContain("ownerId");
  });

  it("returns 401 without a session", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(errorOf(res).code).toBe("unauthenticated");
  });
});

describe("POST /api/auth/forgot-password", () => {
  it("answers ok and sends nothing for an unknown email", async () => {
    const res = await (
      await csrfAgent(app)
    )
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@example.test" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mailer.sent).toHaveLength(0);
    expect(await AuthToken.countDocuments()).toBe(0);
  });

  it("emails a reset link built from APP_URL, never from the Host header", async () => {
    const { email } = await createStudent();
    const res = await (
      await csrfAgent(app)
    )
      .post("/api/auth/forgot-password")
      .set("Host", "evil.test")
      .set("X-Forwarded-Host", "evil.test")
      .send({ email: email.toUpperCase() });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    await vi.waitFor(() => {
      expect(mailer.sent).toHaveLength(1);
    });
    expect(mailer.sent[0]?.to).toBe(email);
    expect(tokenFromLastEmail("/reset-password")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(mailer.sent[0]?.text).not.toContain("evil.test");
    expect(mailer.sent[0]?.html).not.toContain("evil.test");
  });

  it("still answers ok when the email can't be sent", async () => {
    const { email } = await createStudent();
    mailer.failing = true;
    const send = vi.spyOn(mailer, "send");
    const res = await (await csrfAgent(app)).post("/api/auth/forgot-password").send({ email });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    // The send runs after the response; wait for it so it can't leak into the next test.
    await vi.waitFor(() => {
      expect(send).toHaveBeenCalledTimes(1);
    });
    send.mockRestore();
  });

  it("allows 3 per hour per email, then 429", async () => {
    const agent = await csrfAgent(app);
    for (let i = 0; i < 3; i++) {
      await agent
        .post("/api/auth/forgot-password")
        .send({ email: "nobody@example.test" })
        .expect(200);
    }
    const res = await agent
      .post("/api/auth/forgot-password")
      .send({ email: "Nobody@example.test" });
    expect(res.status).toBe(429);
  });
});

describe("POST /api/auth/reset-password", () => {
  async function requestReset(email: string): Promise<string> {
    await (await csrfAgent(app)).post("/api/auth/forgot-password").send({ email }).expect(200);
    await vi.waitFor(() => {
      expect(mailer.sent.length).toBeGreaterThan(0);
    });
    return tokenFromLastEmail("/reset-password");
  }

  it("sets the new password, ends every session, and rejects token reuse", async () => {
    const { email, password } = await createStudent();
    const signedIn = await signIn(request.agent(app), email, password);
    const token = await requestReset(email);
    const anonymous = await csrfAgent(app);

    const res = await anonymous
      .post("/api/auth/reset-password")
      .send({ token, password: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const stale = await signedIn.agent.get("/api/auth/me");
    expect(stale.status).toBe(401);
    expect(cookieHeader(stale, "pp.sid")).toMatch(/^pp\.sid=;/);

    await anonymous.post("/api/auth/signin").send({ email, password }).expect(401);
    await signIn(request.agent(app), email, NEW_PASSWORD);

    const reuse = await anonymous
      .post("/api/auth/reset-password")
      .send({ token, password: "amber-falcon-river-17" });
    expect(reuse.status).toBe(400);
    expect(errorOf(reuse).code).toBe("invalid_token");
  });

  it("rejects a breached password without using up the token", async () => {
    const { email } = await createStudent();
    const token = await requestReset(email);
    const agent = await csrfAgent(app);

    const weak = await agent
      .post("/api/auth/reset-password")
      .send({ token, password: "password1234" });
    expect(weak.status).toBe(400);
    expect(errorOf(weak).code).toBe("validation_failed");
    expect(errorOf(weak).fields).toHaveProperty("password");

    await agent
      .post("/api/auth/reset-password")
      .send({ token, password: NEW_PASSWORD })
      .expect(200);
  });

  it("rejects a password equal to the email", async () => {
    const { email } = await createStudent({ email: "longer-address@example.test" });
    const token = await requestReset(email);

    const res = await (
      await csrfAgent(app)
    )
      .post("/api/auth/reset-password")
      .send({ token, password: email.toUpperCase() });

    expect(res.status).toBe(400);
    expect(errorOf(res).fields).toHaveProperty("password");
  });

  it("rejects a token after 30 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { email } = await createStudent();
    const token = await requestReset(email);
    vi.setSystemTime(Date.now() + 31 * MINUTE_MS);

    const res = await (
      await csrfAgent(app)
    )
      .post("/api/auth/reset-password")
      .send({ token, password: NEW_PASSWORD });

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe("invalid_token");
  });

  it("does not accept a verification token", async () => {
    await signup(studentSignup());
    const token = tokenFromLastEmail("/verify-email");

    const res = await (
      await csrfAgent(app)
    )
      .post("/api/auth/reset-password")
      .send({ token, password: NEW_PASSWORD });
    expect(errorOf(res).code).toBe("invalid_token");
  });
});

describe("token route limits", () => {
  it("give verify-email and reset-password separate 20-per-hour budgets per IP", async () => {
    const agent = await csrfAgent(app);
    const token = "x".repeat(43);
    for (let i = 0; i < 20; i++) {
      await agent.post("/api/auth/verify-email").send({ token }).expect(400);
    }
    const blocked = await agent.post("/api/auth/verify-email").send({ token });
    expect(blocked.status).toBe(429);

    const reset = await agent
      .post("/api/auth/reset-password")
      .send({ token, password: NEW_PASSWORD });
    expect(reset.status).toBe(400);
    expect(errorOf(reset).code).toBe("invalid_token");
  });
});

describe("bumpSessionVersion", () => {
  it("returns the incremented version and ends every existing session", async () => {
    const { user, email, password } = await createStudent();
    const first = await signIn(request.agent(app), email, password);
    const second = await signIn(request.agent(app), email, password);

    expect(await bumpSessionVersion(user.id)).toBe(1);
    expect(await bumpSessionVersion(user.id)).toBe(2);

    await first.agent.get("/api/auth/me").expect(401);
    await second.agent.get("/api/auth/me").expect(401);
    await signIn(request.agent(app), email, password);
  });
});
