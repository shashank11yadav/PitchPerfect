import request from "supertest";
import { describe, expect, it } from "vitest";
import { StudentProfile } from "../src/db/models/index.js";
import { makeTestApp } from "./helpers/app.js";
import { csrfAgent } from "./helpers/csrf.js";
import { useTestDb } from "./helpers/db.js";
import { createEmployer, createStudent, signIn } from "./helpers/factories.js";

useTestDb();

const { app } = makeTestApp();

const completedOf = (res: { body: unknown }) => (res.body as { completed: string[] }).completed;

async function studentSession() {
  const { email, password, user } = await createStudent();
  return { session: await signIn(request.agent(app), email, password), user };
}

describe("lessons", () => {
  it("starts empty", async () => {
    const { session } = await studentSession();
    const res = await session.agent.get("/api/me/lessons");
    expect(res.status).toBe(200);
    expect(completedOf(res)).toEqual([]);
  });

  it("marks a lesson done and lists it", async () => {
    const { session } = await studentSession();

    const put = await session.put("/api/me/lessons/pitching").send({ completed: true });

    expect(put.status).toBe(200);
    expect(completedOf(put)).toEqual(["pitching"]);
    expect(completedOf(await session.agent.get("/api/me/lessons"))).toEqual(["pitching"]);
  });

  it("is idempotent both ways", async () => {
    const { session, user } = await studentSession();

    await session.put("/api/me/lessons/pitching").send({ completed: true });
    const again = await session.put("/api/me/lessons/pitching").send({ completed: true });
    expect(completedOf(again)).toEqual(["pitching"]);
    expect((await StudentProfile.findOne({ userId: user._id }))?.lessonsCompleted).toEqual([
      "pitching",
    ]);

    await session.put("/api/me/lessons/pitching").send({ completed: false });
    const undone = await session.put("/api/me/lessons/pitching").send({ completed: false });
    expect(completedOf(undone)).toEqual([]);
  });

  it("lists lessons in course order, not completion order", async () => {
    const { session } = await studentSession();

    await session.put("/api/me/lessons/next-steps").send({ completed: true });
    await session.put("/api/me/lessons/introducing-yourself").send({ completed: true });
    const res = await session.put("/api/me/lessons/pitching").send({ completed: true });

    expect(completedOf(res)).toEqual(["introducing-yourself", "pitching", "next-steps"]);
  });

  it("rejects an unknown skill and a malformed body", async () => {
    const { session } = await studentSession();

    expect((await session.put("/api/me/lessons/juggling").send({ completed: true })).status).toBe(
      400,
    );
    expect((await session.put("/api/me/lessons/pitching").send({ completed: "yes" })).status).toBe(
      400,
    );
    expect((await session.put("/api/me/lessons/pitching").send({})).status).toBe(400);
  });

  it("is for signed-in students only", async () => {
    const anonymous = await csrfAgent(app);
    expect((await anonymous.agent.get("/api/me/lessons")).status).toBe(401);
    expect((await anonymous.put("/api/me/lessons/pitching").send({ completed: true })).status).toBe(
      401,
    );

    const { email, password } = await createEmployer();
    const employer = await signIn(request.agent(app), email, password);
    expect((await employer.agent.get("/api/me/lessons")).status).toBe(403);
    expect((await employer.put("/api/me/lessons/pitching").send({ completed: true })).status).toBe(
      403,
    );
  });
});
