import mongoose from "mongoose";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthToken, Company, User } from "../src/db/models/index.js";
import { createToken } from "../src/services/tokens.js";
import { verifyPassword } from "../src/services/passwords.js";
import { makeTestApp } from "./helpers/app.js";
import { csrfAgent, withCsrf } from "./helpers/csrf.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import { createEmployer, createStudent, signIn, TEST_PASSWORD } from "./helpers/factories.js";

useTestDb();

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const HOUR_MS = 60 * 60 * 1000;
const NEW_PASSWORD = "copper-meadow-signal-58";

const { app, mailer } = makeTestApp();

afterEach(() => {
  mailer.sent.length = 0;
});

async function storedCreatedAts(): Promise<number[]> {
  const docs = await mongoose.connection.collection("sessions").find().toArray();
  return docs.map((doc) => (JSON.parse(doc.session as string) as { createdAt: number }).createdAt);
}

describe("POST /api/me/change-password", () => {
  const change = (session: Awaited<ReturnType<typeof withCsrf>>, body: object) =>
    session.post("/api/me/change-password").send(body);

  it("needs the current password", async () => {
    const { email, password } = await createStudent();
    const session = await signIn(request.agent(app), email, password);

    expect((await change(session, { newPassword: NEW_PASSWORD })).status).toBe(400);
    const wrong = await change(session, {
      currentPassword: "not-my-password-1",
      newPassword: NEW_PASSWORD,
    });
    expect(wrong.status).toBe(401);
    expect(errorOf(wrong).code).toBe("invalid_credentials");
  });

  it("applies the password policy to the new password", async () => {
    const { email, password, user } = await createStudent();
    const session = await signIn(request.agent(app), email, password);

    const res = await change(session, { currentPassword: password, newPassword: "1qaz2wsx3edc" });

    expect(res.status).toBe(400);
    expect(errorOf(res).fields).toHaveProperty("newPassword");
    const stored = await User.findById(user._id).select("+passwordHash");
    expect(await verifyPassword(stored?.passwordHash ?? "", password)).toBe(true);
  });

  it("rejects the same password", async () => {
    const { email, password } = await createStudent();
    const session = await signIn(request.agent(app), email, password);
    const res = await change(session, { currentPassword: password, newPassword: password });
    expect(res.status).toBe(400);
  });

  it("changes the password, signs other sessions out, and keeps this one", async () => {
    const { email, password, user } = await createStudent();
    const other = await signIn(request.agent(app), email, password);
    const current = await signIn(request.agent(app), email, password);
    await AuthToken.create({
      userId: user._id,
      type: "reset_password",
      tokenHash: "a".repeat(64),
      expiresAt: new Date(Date.now() + HOUR_MS),
    });
    await createToken(user.id, "verify_email", HOUR_MS);

    const res = await change(current, { currentPassword: password, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    await other.agent.get("/api/auth/me").expect(401);
    await current.agent.get("/api/auth/me").expect(200);
    const stored = await User.findById(user._id).select("+passwordHash");
    expect(await verifyPassword(stored?.passwordHash ?? "", NEW_PASSWORD)).toBe(true);
    expect(await AuthToken.countDocuments({ userId: user._id, type: "reset_password" })).toBe(0);
    expect(await AuthToken.countDocuments({ userId: user._id, type: "verify_email" })).toBe(1);

    const old = await (await csrfAgent(app)).post("/api/auth/signin").send({ email, password });
    expect(old.status).toBe(401);
    const fresh = await (
      await csrfAgent(app)
    )
      .post("/api/auth/signin")
      .send({ email, password: NEW_PASSWORD });
    expect(fresh.status).toBe(200);
  });

  it("does not extend the 30-day session window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { email, password } = await createStudent();
    const session = await signIn(request.agent(app), email, password);
    const [signedInAt] = await storedCreatedAts();
    vi.setSystemTime(Date.now() + 5 * HOUR_MS);

    await change(session, { currentPassword: password, newPassword: NEW_PASSWORD }).expect(200);

    expect(await storedCreatedAts()).toEqual([signedInAt]);
  });

  it("requires a session", async () => {
    const res = await change(await csrfAgent(app), {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(401);
  });

  it("allows 5 attempts an hour", async () => {
    const { email, password } = await createStudent();
    const session = await signIn(request.agent(app), email, password);
    const attempt = () =>
      change(session, { currentPassword: "not-my-password-1", newPassword: NEW_PASSWORD });

    for (let i = 0; i < 5; i += 1) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();

    expect(blocked.status).toBe(429);
    expect(errorOf(blocked).code).toBe("rate_limited");
  });
});

describe("POST /api/me/change-email", () => {
  const newEmail = "new.address@example.test";
  const change = (session: Awaited<ReturnType<typeof withCsrf>>, body: object) =>
    session.post("/api/me/change-email").send(body);

  it("needs the current password", async () => {
    const { email, password, user } = await createStudent();
    const session = await signIn(request.agent(app), email, password);

    expect((await change(session, { newEmail })).status).toBe(400);
    const wrong = await change(session, { currentPassword: "not-my-password-1", newEmail });
    expect(wrong.status).toBe(401);
    expect(errorOf(wrong).code).toBe("invalid_credentials");
    expect((await User.findById(user._id))?.email).toBe(email);
    expect(mailer.sent).toHaveLength(0);
  });

  it("refuses an address that is already in use", async () => {
    const { email, password } = await createStudent();
    const taken = await createStudent({ email: "taken@example.test" });
    const session = await signIn(request.agent(app), email, password);

    const res = await change(session, { currentPassword: password, newEmail: taken.email });

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe("email_taken");
    expect(mailer.sent).toHaveLength(0);
  });

  it("refuses the address the account already has", async () => {
    const { email, password } = await createStudent();
    const session = await signIn(request.agent(app), email, password);
    const res = await change(session, { currentPassword: password, newEmail: email });
    expect(res.status).toBe(400);
  });

  it("switches the address, unverifies it, and sends a link to the new one", async () => {
    const { email, password, user } = await createStudent();
    const session = await signIn(request.agent(app), email, password);
    await AuthToken.create({
      userId: user._id,
      type: "reset_password",
      tokenHash: "b".repeat(64),
      expiresAt: new Date(Date.now() + HOUR_MS),
    });

    const res = await change(session, {
      currentPassword: password,
      newEmail: newEmail.toUpperCase(),
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const stored = await User.findById(user._id);
    expect(stored?.email).toBe(newEmail);
    expect(stored?.emailVerifiedAt ?? null).toBeNull();
    expect(await AuthToken.countDocuments({ userId: user._id, type: "reset_password" })).toBe(0);

    const toNew = mailer.sent.filter((message) => message.to === newEmail);
    expect(toNew).toHaveLength(1);
    expect(toNew[0]?.subject).toMatch(/verify/i);
    const link = /token=([\w-]+)/.exec(toNew[0]?.text ?? "")?.[1];
    expect(link).toBeTruthy();
    const verify = await (
      await csrfAgent(app)
    )
      .post("/api/auth/verify-email")
      .send({ token: link });
    expect(verify.status).toBe(200);
    expect((await User.findById(user._id))?.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("tells the old address about the change", async () => {
    const { email, password } = await createStudent();
    const session = await signIn(request.agent(app), email, password);

    await change(session, { currentPassword: password, newEmail }).expect(200);

    const toOld = mailer.sent.filter((message) => message.to === email);
    expect(toOld).toHaveLength(1);
    expect(toOld[0]?.subject).toMatch(/changed/i);
    expect(toOld[0]?.text).not.toContain("token=");
  });

  it("keeps the session signed in and keeps the 30-day window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { email, password } = await createStudent();
    const other = await signIn(request.agent(app), email, password);
    const session = await signIn(request.agent(app), email, password);
    const before = await storedCreatedAts();
    vi.setSystemTime(Date.now() + 5 * HOUR_MS);

    await change(session, { currentPassword: password, newEmail }).expect(200);

    await session.agent.get("/api/auth/me").expect(200);
    await other.agent.get("/api/auth/me").expect(200);
    expect((await storedCreatedAts()).sort()).toEqual(before.sort());
  });

  it("unverifies an employer's verified company, but leaves a suspended one alone", async () => {
    const verified = await createEmployer();
    const session = await signIn(request.agent(app), verified.email, verified.password);
    await change(session, { currentPassword: verified.password, newEmail }).expect(200);
    expect((await Company.findById(verified.company._id))?.verification).toBe("unverified");

    const suspended = await createEmployer();
    await Company.updateOne({ _id: suspended.company._id }, { verification: "suspended" });
    const other = await signIn(request.agent(app), suspended.email, suspended.password);
    await change(other, {
      currentPassword: suspended.password,
      newEmail: "second.address@example.test",
    }).expect(200);
    expect((await Company.findById(suspended.company._id))?.verification).toBe("suspended");
  });

  it("re-verifies the company once the new address on its domain is confirmed", async () => {
    const { email, password, company } = await createEmployer({
      website: "https://www.acme-demo.com",
    });
    const session = await signIn(request.agent(app), email, password);

    await change(session, { currentPassword: password, newEmail: "jane@acme-demo.com" }).expect(
      200,
    );
    expect((await Company.findById(company._id))?.verification).toBe("unverified");
    const link = /token=([\w-]+)/.exec(
      mailer.sent.find((message) => message.to === "jane@acme-demo.com")?.text ?? "",
    )?.[1];
    await (await csrfAgent(app)).post("/api/auth/verify-email").send({ token: link }).expect(200);

    expect((await Company.findById(company._id))?.verification).toBe("verified");
  });

  it("changes nothing when the company can't be updated", async () => {
    const { email, password, user, company } = await createEmployer();
    const session = await signIn(request.agent(app), email, password);
    vi.spyOn(Company, "updateOne").mockRejectedValueOnce(new Error("db down"));

    const res = await change(session, { currentPassword: password, newEmail });

    expect(res.status).toBe(500);
    expect((await User.findById(user._id))?.email).toBe(email);
    expect((await Company.findById(company._id))?.verification).toBe("verified");
    expect(mailer.sent).toHaveLength(0);
  });

  it("requires a session and counts attempts per user", async () => {
    expect(
      (await change(await csrfAgent(app), { currentPassword: TEST_PASSWORD, newEmail })).status,
    ).toBe(401);

    const { email, password } = await createStudent();
    const session = await signIn(request.agent(app), email, password);
    for (let i = 0; i < 5; i += 1) {
      expect(
        (await change(session, { currentPassword: "not-my-password-1", newEmail })).status,
      ).toBe(401);
    }
    const blocked = await change(session, { currentPassword: "not-my-password-1", newEmail });
    expect(blocked.status).toBe(429);
  });
});
