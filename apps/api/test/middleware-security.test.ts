import type { Request, Router } from "express";
import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { doubleCsrf } from "csrf-csrf";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LIMITS, type Role } from "@pitchperfect/shared";
import { User } from "../src/db/models/index.js";
import {
  loadUser,
  requireAuth,
  requireConsent,
  requireRole,
  requireVerified,
  userOf,
} from "../src/middleware/auth.js";
import { byIp, rateLimit } from "../src/middleware/rate-limit.js";
import { destroySession, regenerateSession } from "../src/middleware/session.js";
import { makeTestApp } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";
import { fetchCsrfToken, TEST_ORIGIN } from "./helpers/csrf.js";
import { errorOf } from "./helpers/error-body.js";
import { prodEnv } from "./helpers/env.js";

useTestDb();

afterEach(() => {
  vi.useRealTimers();
});

const ORIGIN = TEST_ORIGIN;
const DAY_MS = 24 * 60 * 60 * 1000;

const keyFromHeader = (req: Request) => req.get("x-test-key") ?? "none";

function extraRoutes(router: Router): void {
  router.post("/__test/write", (_req, res) => {
    res.json({ ok: true });
  });
  router.get("/__test/login/:id/:role", async (req, res) => {
    await regenerateSession(req, {
      userId: req.params.id,
      role: req.params.role as Role,
      sessionVersion: 0,
    });
    res.json({ sessionId: req.sessionID });
  });
  router.get("/__test/elevate/:id/:role", async (req, res) => {
    await regenerateSession(
      req,
      { userId: req.params.id, role: req.params.role as Role, sessionVersion: 0 },
      { preserveCreatedAt: true },
    );
    res.json({ sessionId: req.sessionID });
  });
  router.get("/__test/logout", async (req, res) => {
    await destroySession(req, res);
    res.json({ ok: true });
  });
  router.get("/__test/me", requireAuth, (_req, res) => {
    res.json({ id: userOf(res).id });
  });
  router.get("/__test/employer", requireRole("employer"), (_req, res) => {
    res.json({ ok: true });
  });
  router.get("/__test/verified", requireVerified, (_req, res) => {
    res.json({ ok: true });
  });
  // The partner answering is scripted, as the test coach is.
  const scripted = () => Promise.resolve("scripted" as const);
  router.get("/__test/consent", requireConsent(scripted), (_req, res) => {
    res.json({ ok: true });
  });
  router.get("/__test/user-twice", async (req, res) => {
    const first = await loadUser(req, res);
    const second = await loadUser(req, res);
    res.json({
      same: first === second && first === res.locals.user,
      keys: Object.keys(first ?? {}).sort(),
    });
  });
  const limited = rateLimit("test-limited", { windowMs: 60_000, limit: 2, key: keyFromHeader });
  router.get("/__test/limited", limited, (_req, res) => {
    res.json({ ok: true });
  });
  const byAddress = rateLimit("test-by-ip", { windowMs: 60_000, limit: 1, key: byIp });
  router.get("/__test/by-ip", byAddress, (_req, res) => {
    res.json({ ok: true });
  });
}

const { app } = makeTestApp({ extraRoutes });

interface UserInput {
  role?: Role;
  verified?: boolean;
  consent?: boolean;
}

async function makeUser({ role = "student", verified = true, consent = false }: UserInput = {}) {
  const user = await User.create({
    email: `${role}-${new mongoose.Types.ObjectId().toString()}@example.test`,
    passwordHash: "not-a-real-hash",
    role,
    name: { first: "Test", last: "User" },
    emailVerifiedAt: verified ? new Date() : undefined,
    practiceConsentAt: consent ? new Date() : undefined,
    practiceConsentPartner: consent ? "scripted" : undefined,
  });
  return user;
}

/** An agent that holds a session cookie for a new user. */
async function signedIn(input: UserInput = {}) {
  const user = await makeUser(input);
  const agent = request.agent(app);
  await agent.get(`/api/__test/login/${user.id}/${user.role}`).expect(200);
  return { agent, user };
}

function cookieHeader(res: { headers: Record<string, unknown> }, name: string): string | undefined {
  const cookies = (res.headers["set-cookie"] ?? []) as string[];
  return cookies.filter((cookie) => cookie.startsWith(`${name}=`)).at(-1);
}

describe("CSRF protection", () => {
  it("rejects a POST without the CSRF header", async () => {
    const res = await request(app).post("/api/__test/write").set("Origin", ORIGIN).send({});

    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("csrf_failed");
  });

  it("rejects a POST with a made-up token", async () => {
    const agent = request.agent(app);
    await fetchCsrfToken(agent);
    const res = await agent
      .post("/api/__test/write")
      .set("Origin", ORIGIN)
      .set("x-csrf-token", "0".repeat(64) + "." + "1".repeat(64))
      .send({});

    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("csrf_failed");
  });

  it("rejects a valid token from another browser (cookie not present)", async () => {
    const token = await fetchCsrfToken(request.agent(app));
    const res = await request(app)
      .post("/api/__test/write")
      .set("Origin", ORIGIN)
      .set("x-csrf-token", token)
      .send({});

    expect(errorOf(res).code).toBe("csrf_failed");
  });

  it("accepts a POST with the token and the app origin", async () => {
    const agent = request.agent(app);
    const token = await fetchCsrfToken(agent);
    const res = await agent
      .post("/api/__test/write")
      .set("Origin", ORIGIN)
      .set("x-csrf-token", token)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("works for anonymous visitors without creating a session", async () => {
    const agent = request.agent(app);
    const res = await agent.get("/api/auth/csrf").expect(200);

    expect(cookieHeader(res, "pp.sid")).toBeUndefined();
    expect(await mongoose.connection.collection("sessions").countDocuments()).toBe(0);
    // The token must survive across requests even though no session id was ever issued.
    for (let i = 0; i < 2; i++) {
      await agent
        .post("/api/__test/write")
        .set("Origin", ORIGIN)
        .set("x-csrf-token", (res.body as { csrfToken: string }).csrfToken)
        .send({})
        .expect(200);
    }
  });

  it("fails closed for an anonymous request without the pp.aid browser id", async () => {
    // Mint a token/cookie pair the way the app would if it bound anonymous visitors to a shared
    // constant; it must never be accepted.
    const { config } = makeTestApp();
    const { generateCsrfToken } = doubleCsrf({
      getSecret: () => config.CSRF_SECRET,
      getSessionIdentifier: () => "anonymous:",
      cookieName: "pp.csrf",
      cookieOptions: { sameSite: "lax", secure: false, path: "/", httpOnly: true },
    });
    let cookie = "";
    const fakeRes = {
      cookie: (_name: string, value: string) => {
        cookie = value;
      },
    };
    const token = generateCsrfToken(
      { cookies: {} } as unknown as Request,
      fakeRes as unknown as Parameters<typeof generateCsrfToken>[1],
    );

    const res = await request(app)
      .post("/api/__test/write")
      .set("Origin", ORIGIN)
      .set("Cookie", `pp.csrf=${encodeURIComponent(cookie)}`)
      .set("x-csrf-token", token)
      .send({});

    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("csrf_failed");
  });

  it("rejects a token whose pp.aid cookie was dropped", async () => {
    const agent = request.agent(app);
    const res = await agent.get("/api/auth/csrf");
    const csrfCookie = cookieHeader(res, "pp.csrf")?.split(";")[0] ?? "";

    const post = await request(app)
      .post("/api/__test/write")
      .set("Origin", ORIGIN)
      .set("Cookie", csrfCookie)
      .set("x-csrf-token", (res.body as { csrfToken: string }).csrfToken)
      .send({});
    expect(errorOf(post).code).toBe("csrf_failed");
  });

  it("returns the same token while the cookie is still valid", async () => {
    const agent = request.agent(app);
    expect(await fetchCsrfToken(agent)).toBe(await fetchCsrfToken(agent));
  });

  it("does not cache the token response", async () => {
    const res = await request(app).get("/api/auth/csrf");
    expect(res.get("cache-control")).toContain("no-store");
  });

  it("sets an httpOnly, lax, path=/ cookie without Secure in development", async () => {
    const res = await request(app).get("/api/auth/csrf");
    const cookie = cookieHeader(res, "pp.csrf") ?? "";

    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("Secure");
  });

  it("invalidates the token when the session id changes on sign-in, and a refetch fixes it", async () => {
    const user = await makeUser();
    const agent = request.agent(app);
    const before = await fetchCsrfToken(agent);
    await agent.get(`/api/__test/login/${user.id}/student`).expect(200);

    const stale = await agent
      .post("/api/__test/write")
      .set("Origin", ORIGIN)
      .set("x-csrf-token", before)
      .send({});
    expect(errorOf(stale).code).toBe("csrf_failed");

    const after = await fetchCsrfToken(agent);
    await agent
      .post("/api/__test/write")
      .set("Origin", ORIGIN)
      .set("x-csrf-token", after)
      .send({})
      .expect(200);
  });

  it("skips GET, HEAD and OPTIONS", async () => {
    await request(app).get("/api/__test/me").expect(401);
    const head = await request(app).head("/api/health");
    expect(head.status).not.toBe(403);
    const options = await request(app).options("/api/__test/write");
    expect(options.status).not.toBe(403);
  });
});

describe("origin check", () => {
  async function post(headers: Record<string, string>) {
    const agent = request.agent(app);
    const token = await fetchCsrfToken(agent);
    return agent.post("/api/__test/write").set("x-csrf-token", token).set(headers).send({});
  }

  it("rejects a foreign Origin even with a valid token", async () => {
    const res = await post({ Origin: "https://evil.test" });

    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("csrf_failed");
  });

  it("rejects an Origin that only starts with the app origin", async () => {
    const res = await post({ Origin: "http://localhost:3000.evil.test" });
    expect(res.status).toBe(403);
  });

  it("rejects when Origin and Referer are both missing", async () => {
    const res = await post({});
    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("csrf_failed");
  });

  it("falls back to the Referer origin when Origin is absent", async () => {
    const res = await post({ Referer: `${ORIGIN}/signin?next=%2Fapp` });
    expect(res.status).toBe(200);
  });

  it("rejects a foreign Referer", async () => {
    const res = await post({ Referer: "https://evil.test/page" });
    expect(res.status).toBe(403);
  });

  it("rejects an unparseable Referer", async () => {
    const res = await post({ Referer: "not a url" });
    expect(res.status).toBe(403);
  });

  it("does not fall back to Referer when a foreign Origin is present", async () => {
    const res = await post({ Origin: "https://evil.test", Referer: `${ORIGIN}/` });
    expect(res.status).toBe(403);
  });

  it("rejects the literal null origin", async () => {
    const res = await post({ Origin: "null", Referer: `${ORIGIN}/` });
    expect(res.status).toBe(403);
  });
});

describe("sessions", () => {
  it("stores sessions in the sessions collection with an httpOnly, lax cookie", async () => {
    const user = await makeUser();
    const res = await request(app).get(`/api/__test/login/${user.id}/student`).expect(200);
    const cookie = cookieHeader(res, "pp.sid") ?? "";

    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("Secure");
    const sessions = await mongoose.connection.collection("sessions").find().toArray();
    expect(sessions).toHaveLength(1);
    expect(JSON.stringify(sessions[0])).not.toContain("passwordHash");
  });

  it("sets the cookie to last the rolling window of 7 days", async () => {
    const user = await makeUser();
    const res = await request(app).get(`/api/__test/login/${user.id}/student`);
    const cookie = cookieHeader(res, "pp.sid") ?? "";

    const expires = /Expires=([^;]+)/.exec(cookie)?.[1] ?? "";
    const lifetimeMs = new Date(expires).getTime() - Date.now();
    expect(Math.abs(lifetimeMs - LIMITS.sessionRollingDays * DAY_MS)).toBeLessThan(60_000);
  });

  it("marks cookies Secure in production", async () => {
    const prod = makeTestApp({
      env: prodEnv({ TRUST_PROXY: "1" }),
      extraRoutes,
    });
    const user = await makeUser();
    const agent = request.agent(prod.app);
    const login = await agent
      .get(`/api/__test/login/${user.id}/student`)
      .set("x-forwarded-proto", "https");
    expect(cookieHeader(login, "pp.sid")).toContain("Secure");
    expect(cookieHeader(login, "pp.sid")).toContain("HttpOnly");
    expect(cookieHeader(login, "pp.sid")).toContain("SameSite=Lax");

    const csrf = await agent.get("/api/auth/csrf").set("x-forwarded-proto", "https");
    expect(cookieHeader(csrf, "pp.csrf")).toContain("Secure");

    const logout = await agent.get("/api/__test/logout").set("x-forwarded-proto", "https");
    const cleared = cookieHeader(logout, "pp.sid") ?? "";
    expect(cleared).toContain("Secure");
    expect(cleared).toContain("HttpOnly");
    expect(cleared).toContain("SameSite=Lax");
    expect(cleared).toContain("Path=/");
  });

  it("rolls: each response renews the cookie", async () => {
    const { agent } = await signedIn();
    const res = await agent.get("/api/__test/me");

    expect(res.status).toBe(200);
    expect(cookieHeader(res, "pp.sid")).toBeDefined();
  });

  it("issues a new session id on every sign-in (no fixation)", async () => {
    const user = await makeUser();
    const agent = request.agent(app);
    const first = await agent.get(`/api/__test/login/${user.id}/student`);
    const second = await agent.get(`/api/__test/login/${user.id}/student`);

    expect((first.body as { sessionId: string }).sessionId).not.toBe(
      (second.body as { sessionId: string }).sessionId,
    );
    expect(await mongoose.connection.collection("sessions").countDocuments()).toBe(1);
  });

  it("destroySession removes the stored session and clears pp.sid with identical attributes", async () => {
    const { agent } = await signedIn();
    const issued = await agent.get("/api/__test/me");
    const set = cookieHeader(issued, "pp.sid") ?? "";

    const res = await agent.get("/api/__test/logout").expect(200);
    const cleared = cookieHeader(res, "pp.sid") ?? "";

    expect(cleared).toMatch(/^pp\.sid=;/);
    expect(cleared).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    for (const attribute of ["Path=/", "HttpOnly", "SameSite=Lax"]) {
      expect(set).toContain(attribute);
      expect(cleared).toContain(attribute);
    }
    expect(cleared).not.toContain("Secure");
    expect(await mongoose.connection.collection("sessions").countDocuments()).toBe(0);
    await agent.get("/api/__test/me").expect(401);
  });

  it("treats a session whose user was deleted as signed out and clears the cookie", async () => {
    const { agent, user } = await signedIn();
    await User.deleteOne({ _id: user._id });

    const res = await agent.get("/api/__test/me");

    expect(res.status).toBe(401);
    expect(cookieHeader(res, "pp.sid")).toMatch(/^pp\.sid=;/);
    expect(await mongoose.connection.collection("sessions").countDocuments()).toBe(0);
  });

  it("ends a session after 30 days even though the 7-day window keeps rolling", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { agent } = await signedIn();

    for (let step = 0; step < 4; step++) {
      vi.setSystemTime(Date.now() + 6 * DAY_MS);
      await agent.get("/api/__test/me").expect(200);
    }
    // 24 days in: still signed in. Jump to day 30 + 1 hour, within 7 days of the last request.
    vi.setSystemTime(Date.now() + 6 * DAY_MS + 60 * 60 * 1000);
    const res = await agent.get("/api/__test/me");

    expect(res.status).toBe(401);
    expect(errorOf(res).code).toBe("unauthenticated");
    expect(cookieHeader(res, "pp.sid")).toMatch(/^pp\.sid=;/);
    expect(await mongoose.connection.collection("sessions").countDocuments()).toBe(0);
  });

  it("ends sessions whose version no longer matches the user's (password reset)", async () => {
    const { agent, user } = await signedIn();
    await agent.get("/api/__test/me").expect(200);
    await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } });

    const res = await agent.get("/api/__test/me");

    expect(res.status).toBe(401);
    expect(cookieHeader(res, "pp.sid")).toMatch(/^pp\.sid=;/);
    expect(await mongoose.connection.collection("sessions").countDocuments()).toBe(0);
  });

  it("stores the session version in the session", async () => {
    const user = await makeUser();
    await request(app).get(`/api/__test/login/${user.id}/student`).expect(200);
    const stored = await mongoose.connection.collection("sessions").findOne();
    expect(JSON.parse(String(stored?.session))).toMatchObject({
      userId: user.id,
      role: "student",
      sessionVersion: 0,
    });
  });

  it("keeps the absolute 30-day window across a privilege change (preserveCreatedAt)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { agent, user } = await signedIn();
    for (let step = 0; step < 4; step++) {
      vi.setSystemTime(Date.now() + 6 * DAY_MS);
      await agent.get("/api/__test/me").expect(200);
    }

    const sessionsBefore = await mongoose.connection.collection("sessions").find().toArray();
    const elevated = await agent.get(`/api/__test/elevate/${user.id}/student`).expect(200);
    expect(sessionsBefore.map((doc) => String(doc._id))).not.toContain(
      (elevated.body as { sessionId: string }).sessionId,
    );
    // Day 30 + 1 hour from the original sign-in, but only 6 days after the privilege change.
    vi.setSystemTime(Date.now() + 6 * DAY_MS + 60 * 60 * 1000);

    await agent.get("/api/__test/me").expect(401);
  });

  it("starts a fresh window and a new session id on a plain sign-in", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { agent, user } = await signedIn();
    for (let step = 0; step < 4; step++) {
      vi.setSystemTime(Date.now() + 6 * DAY_MS);
      await agent.get("/api/__test/me").expect(200);
    }
    const elevated = await agent.get(`/api/__test/elevate/${user.id}/student`).expect(200);
    const relogin = await agent.get(`/api/__test/login/${user.id}/student`).expect(200);
    expect((relogin.body as { sessionId: string }).sessionId).not.toBe(
      (elevated.body as { sessionId: string }).sessionId,
    );
    vi.setSystemTime(Date.now() + 6 * DAY_MS + 60 * 60 * 1000);

    await agent.get("/api/__test/me").expect(200);
  });

  it("lets a user sign in again right after an over-age session is dropped", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { agent, user } = await signedIn();
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(Date.now() + 6 * DAY_MS);
      await agent.get("/api/__test/me");
    }
    vi.setSystemTime(Date.now() + 2 * DAY_MS);

    await agent.get(`/api/__test/login/${user.id}/student`).expect(200);
    await agent.get("/api/__test/me").expect(200);
  });
});

describe("auth guards", () => {
  it("returns 401 unauthenticated without a session", async () => {
    const res = await request(app).get("/api/__test/me");

    expect(res.status).toBe(401);
    expect(errorOf(res).code).toBe("unauthenticated");
  });

  it("lets a signed-in user through", async () => {
    const { agent, user } = await signedIn();
    const res = await agent.get("/api/__test/me").expect(200);

    expect((res.body as { id: string }).id).toBe(user.id);
  });

  it("requireRole returns 403 forbidden for the wrong role and passes the right one", async () => {
    const student = await signedIn({ role: "student" });
    const wrong = await student.agent.get("/api/__test/employer");
    expect(wrong.status).toBe(403);
    expect(errorOf(wrong).code).toBe("forbidden");

    const employer = await signedIn({ role: "employer" });
    await employer.agent.get("/api/__test/employer").expect(200);
  });

  it("requireRole returns 401 without a session", async () => {
    const res = await request(app).get("/api/__test/employer");
    expect(res.status).toBe(401);
  });

  it("requireVerified returns 403 email_not_verified for unverified users", async () => {
    const unverified = await signedIn({ verified: false });
    const res = await unverified.agent.get("/api/__test/verified");
    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("email_not_verified");

    const verified = await signedIn({ verified: true });
    await verified.agent.get("/api/__test/verified").expect(200);
    await request(app).get("/api/__test/verified").expect(401);
  });

  it("requireConsent needs practice consent from a student and forbids other roles", async () => {
    const without = await signedIn({ role: "student", consent: false });
    const missing = await without.agent.get("/api/__test/consent");
    expect(missing.status).toBe(403);
    expect(errorOf(missing).code).toBe("consent_required");

    const consented = await signedIn({ role: "student", consent: true });
    await consented.agent.get("/api/__test/consent").expect(200);

    const employer = await signedIn({ role: "employer", consent: true });
    const wrongRole = await employer.agent.get("/api/__test/consent");
    expect(wrongRole.status).toBe(403);
    expect(errorOf(wrongRole).code).toBe("forbidden");

    await request(app).get("/api/__test/consent").expect(401);
  });

  it("loads the user once per request and never exposes the password hash", async () => {
    const { agent } = await signedIn();
    const res = await agent.get("/api/__test/user-twice").expect(200);

    expect(res.body).toEqual({
      same: true,
      keys: ["emailVerifiedAt", "id", "practiceConsentAt", "practiceConsentPartner", "role"],
    });
  });

  it("uses the role stored in the database, not the one in the session", async () => {
    const student = await makeUser({ role: "student" });
    const agent = request.agent(app);
    await agent.get(`/api/__test/login/${student.id}/employer`).expect(200);

    const res = await agent.get("/api/__test/employer");
    expect(res.status).toBe(403);
  });
});

describe("rate limits", () => {
  it("allows the limit and then returns 429 rate_limited with Retry-After", async () => {
    const send = () => request(app).get("/api/__test/limited").set("x-test-key", "a");

    await send().expect(200);
    await send().expect(200);
    const res = await send();

    expect(res.status).toBe(429);
    expect(errorOf(res).code).toBe("rate_limited");
    const retryAfter = Number(res.get("retry-after"));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it("counts each key separately", async () => {
    const send = (key: string) => request(app).get("/api/__test/limited").set("x-test-key", key);
    await send("a").expect(200);
    await send("a").expect(200);
    await send("a").expect(429);
    await send("b").expect(200);
  });

  it("starts a new window once the old one has passed, even before the TTL sweep", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const send = () => request(app).get("/api/__test/limited").set("x-test-key", "w");
    await send().expect(200);
    await send().expect(200);
    await send().expect(429);

    vi.setSystemTime(Date.now() + 61_000);

    await send().expect(200);
  });

  it("limits by IP with the byIp key", async () => {
    await request(app).get("/api/__test/by-ip").expect(200);
    const res = await request(app).get("/api/__test/by-ip");
    expect(res.status).toBe(429);
  });

  it("stores counters in ratelimits with a TTL index", async () => {
    await request(app).get("/api/__test/limited").set("x-test-key", "t").expect(200);

    const docs = await mongoose.connection.collection("ratelimits").find().toArray();
    expect(docs).toHaveLength(1);
    expect(String(docs[0]?._id)).toBe(
      `test-limited:${createHash("sha256").update("t").digest("hex")}`,
    );
    const indexes = await mongoose.connection.collection("ratelimits").indexes();
    expect(indexes.some((index) => index.expireAfterSeconds === 0)).toBe(true);
  });

  it("never stores the raw key, so emails in keys stay out of the database", async () => {
    await request(app)
      .get("/api/__test/limited")
      .set("x-test-key", "someone@example.test")
      .expect(200);

    const docs = await mongoose.connection.collection("ratelimits").find().toArray();
    expect(JSON.stringify(docs)).not.toContain("someone");
    expect(String(docs[0]?._id)).toMatch(/^test-limited:[0-9a-f]{64}$/);
  });

  it("groups IPv6 clients by /64", async () => {
    const ipv6App = makeTestApp({ env: { TRUST_PROXY: "1" }, extraRoutes }).app;
    await request(ipv6App)
      .get("/api/__test/by-ip")
      .set("X-Forwarded-For", "2001:db8:1:2:aaaa::1")
      .expect(200);
    const sameSlash64 = await request(ipv6App)
      .get("/api/__test/by-ip")
      .set("X-Forwarded-For", "2001:db8:1:2:bbbb::2");
    expect(sameSlash64.status).toBe(429);
    await request(ipv6App)
      .get("/api/__test/by-ip")
      .set("X-Forwarded-For", "2001:db8:1:3::1")
      .expect(200);
  });

  it("does not overshoot under concurrent requests", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(app).get("/api/__test/limited").set("x-test-key", "c"),
      ),
    );
    expect(results.filter((res) => res.status === 200)).toHaveLength(2);
    expect(results.filter((res) => res.status === 429)).toHaveLength(4);
  });
});
