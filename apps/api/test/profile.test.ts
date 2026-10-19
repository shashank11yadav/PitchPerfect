import request from "supertest";
import { describe, expect, it } from "vitest";
import { StudentProfile, User } from "../src/db/models/index.js";
import { makeTestApp } from "./helpers/app.js";
import { csrfAgent } from "./helpers/csrf.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import { createEmployer, createStudent, signIn } from "./helpers/factories.js";

useTestDb();

const { app } = makeTestApp();

describe("PATCH /api/me/profile", () => {
  it("updates a student's role fields and returns the profile", async () => {
    const { email, password, user } = await createStudent();
    const session = await signIn(request.agent(app), email, password);

    const res = await session.patch("/api/me/profile").send({ major: "Economics" });

    expect(res.status).toBe(200);
    expect((res.body as { profile: { major: string } }).profile.major).toBe("Economics");
    expect((await StudentProfile.findOne({ userId: user._id }))?.major).toBe("Economics");
  });

  it("updates names on the user and returns the user too", async () => {
    const { email, password, user } = await createStudent();
    const session = await signIn(request.agent(app), email, password);

    const res = await session.patch("/api/me/profile").send({ firstName: "Robin", school: "X U" });

    const body = res.body as { user: { firstName: string; email: string }; profile: object };
    expect(res.status).toBe(200);
    expect(body.user.firstName).toBe("Robin");
    expect(body.user.email).toBe(email);
    expect(JSON.stringify(body)).not.toContain("passwordHash");
    expect((await User.findById(user._id))?.name.first).toBe("Robin");
  });

  it("answers 200 and changes nothing for an empty update", async () => {
    const { email, password, profile } = await createStudent();
    const session = await signIn(request.agent(app), email, password);

    const res = await session.patch("/api/me/profile").send({});

    expect(res.status).toBe(200);
    expect((res.body as { profile: { major: string } }).profile.major).toBe(profile.major);
  });

  it("rejects fields that don't belong to the profile", async () => {
    const { email, password, user } = await createStudent();
    const session = await signIn(request.agent(app), email, password);

    for (const extra of [
      { email: "other@example.test" },
      { role: "employer" },
      { emailVerifiedAt: "2020-01-01T00:00:00.000Z" },
      { jobTitle: "Recruiter" },
    ]) {
      const res = await session.patch("/api/me/profile").send(extra);
      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe("validation_failed");
    }
    const stored = await User.findById(user._id);
    expect(stored?.role).toBe("student");
    expect(stored?.email).toBe(email);
  });

  it("rejects an out-of-range graduation year", async () => {
    const { email, password } = await createStudent();
    const session = await signIn(request.agent(app), email, password);

    const res = await session.patch("/api/me/profile").send({ gradYear: 1990 });

    expect(res.status).toBe(400);
    expect(errorOf(res).fields).toHaveProperty("gradYear");
  });

  it("updates an employer's job title and refuses student fields", async () => {
    const { email, password } = await createEmployer();
    const session = await signIn(request.agent(app), email, password);

    const ok = await session.patch("/api/me/profile").send({ jobTitle: "Founder" });
    const bad = await session.patch("/api/me/profile").send({ school: "X U" });

    expect(ok.status).toBe(200);
    expect((ok.body as { profile: { jobTitle: string } }).profile.jobTitle).toBe("Founder");
    expect(bad.status).toBe(400);
  });

  it("requires a session and a CSRF token", async () => {
    const anonymous = await csrfAgent(app);
    expect((await anonymous.patch("/api/me/profile").send({ major: "X" })).status).toBe(401);

    const { email, password } = await createStudent();
    const session = await signIn(request.agent(app), email, password);
    const noCsrf = await session.agent
      .patch("/api/me/profile")
      .set("Origin", "http://localhost:3000")
      .send({ major: "X" });
    expect(noCsrf.status).toBe(403);
    expect(errorOf(noCsrf).code).toBe("csrf_failed");
  });
});

describe("POST /api/me/practice-consent", () => {
  it("records consent once and keeps the first timestamp", async () => {
    const { email, password, user } = await createStudent();
    const session = await signIn(request.agent(app), email, password);

    const first = await session.post("/api/me/practice-consent").send({ accepted: true });
    const second = await session.post("/api/me/practice-consent").send({ accepted: true });

    const stamp = (first.body as { practiceConsentAt: string }).practiceConsentAt;
    expect(first.status).toBe(200);
    expect(new Date(stamp).getTime()).not.toBeNaN();
    expect((second.body as { practiceConsentAt: string }).practiceConsentAt).toBe(stamp);
    expect((await User.findById(user._id))?.practiceConsentAt?.toISOString()).toBe(stamp);
  });

  it("rejects anything but accepted: true", async () => {
    const { email, password } = await createStudent();
    const session = await signIn(request.agent(app), email, password);

    expect((await session.post("/api/me/practice-consent").send({ accepted: false })).status).toBe(
      400,
    );
    expect((await session.post("/api/me/practice-consent").send({})).status).toBe(400);
  });

  it("is for students only", async () => {
    const { email, password, user } = await createEmployer();
    const session = await signIn(request.agent(app), email, password);

    const res = await session.post("/api/me/practice-consent").send({ accepted: true });

    expect(res.status).toBe(403);
    expect((await User.findById(user._id))?.practiceConsentAt).toBeUndefined();
  });

  it("requires a session", async () => {
    const anonymous = await csrfAgent(app);
    expect((await anonymous.post("/api/me/practice-consent").send({ accepted: true })).status).toBe(
      401,
    );
  });
});
