import argon2 from "argon2";
import mongoose from "mongoose";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthToken, Company, User } from "../src/db/models/index.js";
import { createToken } from "../src/services/tokens.js";
import type { MailMessage } from "../src/services/mailer.js";
import { verifyPassword } from "../src/services/passwords.js";
import { makeTestApp } from "./helpers/app.js";
import { csrfAgent, withCsrf } from "./helpers/csrf.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import { FakeMailer } from "./helpers/fake-mailer.js";
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

  /** Two signed-in students: one asks for a free address, the other for one that has an account. */
  async function freeAndTakenChanges(target = app) {
    const owner = await createStudent({ email: "owner@example.test" });
    const free = await createStudent();
    const taken = await createStudent();
    const freeSession = await signIn(request.agent(target), free.email, free.password);
    const takenSession = await signIn(request.agent(target), taken.email, taken.password);
    return { owner, free, taken, freeSession, takenSession };
  }

  const cookieNames = (res: { headers: Record<string, unknown> }) =>
    ((res.headers["set-cookie"] ?? []) as string[]).map((cookie) => cookie.split("=")[0]).sort();

  it("answers an address that is already in use exactly like a free one", async () => {
    const { free, taken, owner, freeSession, takenSession } = await freeAndTakenChanges();

    const toFree = await change(freeSession, { currentPassword: free.password, newEmail });
    const toTaken = await change(takenSession, {
      currentPassword: taken.password,
      newEmail: owner.email,
    });

    expect(toTaken.status).toBe(toFree.status);
    expect(toTaken.status).toBe(200);
    expect(toTaken.body).toEqual(toFree.body);
    expect(Object.keys(toTaken.headers).sort()).toEqual(Object.keys(toFree.headers).sort());
    // Both get a new session id, so the CSRF token held before stops matching in both.
    expect(cookieNames(toTaken)).toEqual(cookieNames(toFree));
    expect(cookieNames(toTaken)).toContain("pp.sid");
    for (const session of [freeSession, takenSession]) {
      const stale = await change(session, { currentPassword: "not-my-password-1", newEmail });
      expect(errorOf(stale).code).toBe("csrf_failed");
    }
  });

  it("leaves /me the same for a free and a taken address until the link is followed", async () => {
    const { free, taken, owner, freeSession, takenSession } = await freeAndTakenChanges();

    await change(freeSession, { currentPassword: free.password, newEmail }).expect(200);
    await change(takenSession, { currentPassword: taken.password, newEmail: owner.email }).expect(
      200,
    );

    const meOf = async (session: Awaited<ReturnType<typeof withCsrf>>) =>
      (await session.agent.get("/api/auth/me").expect(200)).body as {
        user: Record<string, unknown>;
      };
    const freeMe = (await meOf(freeSession)).user;
    const takenMe = (await meOf(takenSession)).user;
    expect(freeMe).toMatchObject({ email: free.email, pendingEmail: newEmail });
    expect(takenMe).toMatchObject({ email: taken.email, pendingEmail: owner.email });
    expect(Object.keys(freeMe).sort()).toEqual(Object.keys(takenMe).sort());
    expect(freeMe.emailVerifiedAt).toEqual(expect.any(String));
    expect(takenMe.emailVerifiedAt).toEqual(expect.any(String));
  });

  it("changes nothing for an address in use, and sends its owner a notice instead of a link", async () => {
    const employer = await createEmployer();
    const owner = await createStudent({ email: "owner@example.test" });
    const session = await signIn(request.agent(app), employer.email, employer.password);
    const before = await User.findById(employer.user._id).lean();

    await change(session, {
      currentPassword: employer.password,
      newEmail: "Owner@Example.test",
    }).expect(200);

    const after = await User.findById(employer.user._id).lean();
    expect(after?.email).toBe(employer.email);
    expect(after?.emailVerifiedAt).toEqual(before?.emailVerifiedAt);
    expect((await Company.findById(employer.company._id))?.verification).toBe("verified");
    expect(await AuthToken.countDocuments()).toBe(0);
    expect((await User.findById(owner.user._id).lean())?.email).toBe(owner.email);
    await session.agent.get("/api/auth/me").expect(200);

    expect(mailer.sent).toHaveLength(1);
    const notice = mailer.sent[0];
    expect(notice?.to).toBe(owner.email);
    expect(notice?.subject).not.toMatch(/verify/i);
    expect(notice?.text).not.toContain("token=");
    expect(notice?.text).toContain("/forgot-password");
  });

  it("does the same work either way: one password check, and no wait for the mail server", async () => {
    // A mail server that never answers: neither answer may wait for it.
    class StalledMailer extends FakeMailer {
      override send(message: MailMessage): Promise<void> {
        this.sent.push(message);
        return new Promise(() => undefined);
      }
    }
    const stalled = makeTestApp({ mailer: new StalledMailer() });
    const { free, taken, owner, freeSession, takenSession } = await freeAndTakenChanges(
      stalled.app,
    );
    const verify = vi.spyOn(argon2, "verify");
    const hash = vi.spyOn(argon2, "hash");

    await change(freeSession, { currentPassword: free.password, newEmail }).expect(200);
    const freeCalls = { verify: verify.mock.calls.length, hash: hash.mock.calls.length };
    verify.mockClear();
    hash.mockClear();
    await change(takenSession, { currentPassword: taken.password, newEmail: owner.email }).expect(
      200,
    );

    expect({ verify: verify.mock.calls.length, hash: hash.mock.calls.length }).toEqual(freeCalls);
    expect(freeCalls).toEqual({ verify: 1, hash: 0 });
    expect(stalled.mailer.sent.map((message) => message.to)).toContain(owner.email);
  });

  it("checks the password before anything else, taken address or not", async () => {
    const { taken, owner, takenSession } = await freeAndTakenChanges();

    const wrong = await change(takenSession, {
      currentPassword: "not-my-password-1",
      newEmail: owner.email,
    });

    expect(wrong.status).toBe(401);
    expect(errorOf(wrong).code).toBe("invalid_credentials");
    expect((await User.findById(taken.user._id))?.email).toBe(taken.email);
    expect(mailer.sent).toHaveLength(0);
  });

  it("refuses the address the account already has", async () => {
    const { email, password } = await createStudent();
    const session = await signIn(request.agent(app), email, password);
    const res = await change(session, { currentPassword: password, newEmail: email });
    expect(res.status).toBe(400);
  });

  /** The token in the last email sent to `to`. */
  const linkSentTo = (to: string) =>
    /token=([\w-]+)/.exec(mailer.sent.findLast((message) => message.to === to)?.text ?? "")?.[1];

  const followLink = async (token: string | undefined) =>
    (await csrfAgent(app)).post("/api/auth/verify-email").send({ token });

  it("keeps the address until the link is followed, then switches it as confirmed", async () => {
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
    expect((await User.findById(user._id))?.email).toBe(email);
    const toNew = mailer.sent.filter((message) => message.to === newEmail);
    expect(toNew).toHaveLength(1);
    expect(toNew[0]?.subject).toMatch(/confirm your new/i);
    expect(mailer.sent.filter((message) => message.to === email)).toHaveLength(0);

    expect((await followLink(linkSentTo(newEmail))).status).toBe(200);

    const stored = await User.findById(user._id);
    expect(stored?.email).toBe(newEmail);
    expect(stored?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await AuthToken.countDocuments({ userId: user._id, type: "reset_password" })).toBe(0);
    const me = await session.agent.get("/api/auth/me").expect(200);
    expect((me.body as { user: Record<string, unknown> }).user).not.toHaveProperty("pendingEmail");
    expect(errorOf(await followLink(linkSentTo(newEmail))).code).toBe("invalid_token");
  });

  it("applies the link only if the address is still free when it is followed", async () => {
    const { email, password, user } = await createStudent();
    const session = await signIn(request.agent(app), email, password);
    await change(session, { currentPassword: password, newEmail }).expect(200);
    const token = linkSentTo(newEmail);
    await createStudent({ email: newEmail });
    mailer.sent.length = 0;

    const res = await followLink(token);

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe("invalid_token");
    expect((await User.findById(user._id))?.email).toBe(email);
    expect(mailer.sent.map((message) => message.to)).toEqual([newEmail]);
    expect(mailer.sent[0]?.text).not.toContain("token=");
    const me = await session.agent.get("/api/auth/me").expect(200);
    expect((me.body as { user: Record<string, unknown> }).user).not.toHaveProperty("pendingEmail");
  });

  it("lets a newer request replace the pending one and its link", async () => {
    const { email, password, user } = await createStudent();
    const session = await signIn(request.agent(app), email, password);
    await change(session, { currentPassword: password, newEmail }).expect(200);
    const first = linkSentTo(newEmail);
    const second = "second.address@example.test";
    // The first request gave the session a new id, so it needs a new CSRF token.
    await change(await withCsrf(session.agent), {
      currentPassword: password,
      newEmail: second,
    }).expect(200);

    expect(errorOf(await followLink(first)).code).toBe("invalid_token");
    expect((await User.findById(user._id))?.email).toBe(email);
    expect((await followLink(linkSentTo(second))).status).toBe(200);
    expect((await User.findById(user._id))?.email).toBe(second);
  });

  it("tells the old address once the change is made", async () => {
    const { email, password } = await createStudent();
    const session = await signIn(request.agent(app), email, password);

    await change(session, { currentPassword: password, newEmail }).expect(200);
    expect((await followLink(linkSentTo(newEmail))).status).toBe(200);

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
    expect((await followLink(linkSentTo(newEmail))).status).toBe(200);

    await session.agent.get("/api/auth/me").expect(200);
    await other.agent.get("/api/auth/me").expect(200);
    expect((await storedCreatedAts()).sort()).toEqual(before.sort());
  });

  it("unverifies an employer's verified company once the link is followed, but leaves a suspended one alone", async () => {
    const verified = await createEmployer();
    const session = await signIn(request.agent(app), verified.email, verified.password);
    await change(session, { currentPassword: verified.password, newEmail }).expect(200);
    expect((await Company.findById(verified.company._id))?.verification).toBe("verified");
    expect((await followLink(linkSentTo(newEmail))).status).toBe(200);
    expect((await Company.findById(verified.company._id))?.verification).toBe("unverified");

    const suspended = await createEmployer();
    await Company.updateOne({ _id: suspended.company._id }, { verification: "suspended" });
    const other = await signIn(request.agent(app), suspended.email, suspended.password);
    const second = "second.address@example.test";
    await change(other, { currentPassword: suspended.password, newEmail: second }).expect(200);
    expect((await followLink(linkSentTo(second))).status).toBe(200);
    expect((await Company.findById(suspended.company._id))?.verification).toBe("suspended");
  });

  it("keeps the company verified when the new address is on its domain", async () => {
    const { email, password, company } = await createEmployer({
      website: "https://www.acme-demo.com",
    });
    const session = await signIn(request.agent(app), email, password);

    await change(session, { currentPassword: password, newEmail: "jane@acme-demo.com" }).expect(
      200,
    );
    expect((await Company.findById(company._id))?.verification).toBe("verified");
    expect((await followLink(linkSentTo("jane@acme-demo.com"))).status).toBe(200);

    expect((await Company.findById(company._id))?.verification).toBe("verified");
  });

  it("changes nothing, and keeps the link working, when the company can't be updated", async () => {
    const { email, password, user, company } = await createEmployer();
    const session = await signIn(request.agent(app), email, password);
    await change(session, { currentPassword: password, newEmail }).expect(200);
    const token = linkSentTo(newEmail);
    mailer.sent.length = 0;
    vi.spyOn(Company, "updateOne").mockRejectedValueOnce(new Error("db down"));

    const res = await followLink(token);

    expect(res.status).toBe(500);
    expect((await User.findById(user._id))?.email).toBe(email);
    expect((await Company.findById(company._id))?.verification).toBe("verified");
    expect(mailer.sent).toHaveLength(0);
    expect((await followLink(token)).status).toBe(200);
    expect((await User.findById(user._id))?.email).toBe(newEmail);
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
