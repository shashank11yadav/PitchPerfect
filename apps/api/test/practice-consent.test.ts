import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthMe } from "@pitchperfect/shared";
import { User } from "../src/db/models/index.js";
import { COACH_PROBE_TTL_MS } from "../src/services/coach-probe.js";
import { makeTestApp } from "./helpers/app.js";
import type { CsrfAgent } from "./helpers/csrf.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import { FakeCoachClient } from "./helpers/fake-coach.js";
import { createStudent, signIn } from "./helpers/factories.js";

useTestDb();

const CONSENT_PATH = "/api/me/practice-consent";
const SESSIONS_PATH = "/api/practice/sessions";

afterEach(() => {
  vi.useRealTimers();
});

/**
 * An app whose coach runs `provider` (`fake` is the scripted partner), and a signed-in student.
 * The fake coach fails every plan, so a start that gets past the consent check answers `503`.
 */
async function setup(provider: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  const coach = new FakeCoachClient("ok", provider);
  const { app } = makeTestApp({ coach });
  const student = await createStudent();
  const session = await signIn(request.agent(app), student.email, student.password);
  /** Switches the coach's provider; the api's cached probe has expired by the next request. */
  const switchTo = (next: string) => {
    coach.provider = next;
    vi.setSystemTime(Date.now() + COACH_PROBE_TTL_MS + 1);
  };
  return { ...student, session, switchTo };
}

const start = (session: CsrfAgent) => session.post(SESSIONS_PATH).send({ skill: "pitching" });
const accept = (session: CsrfAgent, partner: string) =>
  session.post(CONSENT_PATH).send({ accepted: true, partner });

async function consentOf(session: CsrfAgent) {
  const { user } = (await session.agent.get("/api/auth/me")).body as AuthMe;
  return { at: user.practiceConsentAt, partner: user.practiceConsentPartner };
}

describe("practice consent and the kind of partner", () => {
  it("stores which partner the student accepted, and when", async () => {
    const { session, user } = await setup("fake");

    const res = await accept(session, "scripted");

    expect(res.status).toBe(200);
    const body = res.body as { practiceConsentAt: string; practiceConsentPartner: string };
    expect(body.practiceConsentPartner).toBe("scripted");
    expect(await consentOf(session)).toEqual({ at: body.practiceConsentAt, partner: "scripted" });
    const stored = await User.findById(user._id).lean();
    expect(stored?.practiceConsentPartner).toBe("scripted");
    expect(stored?.practiceConsentAt?.toISOString()).toBe(body.practiceConsentAt);
  });

  it("lets a start through for the partner the student accepted", async () => {
    const { session } = await setup("openai");
    await accept(session, "live");

    // Past the consent check: the test coach fails the plan itself.
    expect((await start(session)).status).toBe(503);
  });

  it("asks again before the next start once the scripted partner becomes a live model", async () => {
    const { session, switchTo } = await setup("fake");
    const first = (await accept(session, "scripted")).body as { practiceConsentAt: string };
    switchTo("anthropic");

    const res = await start(session);

    expect(res.status).toBe(403);
    expect(errorOf(res)).toMatchObject({
      code: "consent_required",
      message: "The practice partner has changed. Accept the new practice notice to continue",
    });

    const again = await accept(session, "live");
    expect(again.status).toBe(200);
    const body = again.body as { practiceConsentAt: string; practiceConsentPartner: string };
    expect(body.practiceConsentPartner).toBe("live");
    expect(new Date(body.practiceConsentAt).getTime()).toBeGreaterThan(
      new Date(first.practiceConsentAt).getTime(),
    );
    expect((await start(session)).status).toBe(503);
  });

  it("asks again when a live model is replaced by the scripted partner", async () => {
    const { session, switchTo } = await setup("openai");
    await accept(session, "live");
    switchTo("fake");

    expect(errorOf(await start(session)).code).toBe("consent_required");
    expect((await accept(session, "scripted")).status).toBe(200);
    expect((await start(session)).status).toBe(503);
  });

  it("describes a coach it can't reach as live, so a scripted consent is asked again", async () => {
    const { app } = makeTestApp({ coach: new FakeCoachClient("down") });
    const { email, password, user } = await createStudent();
    await User.updateOne(
      { _id: user._id },
      { practiceConsentAt: new Date(), practiceConsentPartner: "scripted" },
    );
    const session = await signIn(request.agent(app), email, password);

    expect(errorOf(await start(session)).code).toBe("consent_required");
    expect((await accept(session, "live")).status).toBe(200);
  });

  it("asks again for a consent stored before the kind was recorded, whatever the partner", async () => {
    for (const provider of ["fake", "openai"]) {
      const { session, user } = await setup(provider);
      await User.updateOne({ _id: user._id }, { practiceConsentAt: new Date("2026-10-20") });

      expect(await consentOf(session)).toEqual({ at: "2026-10-20T00:00:00.000Z", partner: null });
      const res = await start(session);
      expect(res.status, provider).toBe(403);
      expect(errorOf(res).code).toBe("consent_required");
    }
  });

  it("refuses an acceptance of a notice for a partner that isn't the one answering", async () => {
    const { session, user } = await setup("openai");

    const res = await accept(session, "scripted");

    expect(res.status).toBe(409);
    expect(errorOf(res)).toMatchObject({
      code: "conflict",
      message: "The practice partner has changed. Read the new notice and accept it again",
    });
    expect((await User.findById(user._id).lean())?.practiceConsentAt).toBeUndefined();
  });

  it("keeps the first timestamp when the same notice is accepted again", async () => {
    const { session } = await setup("fake");
    const first = (await accept(session, "scripted")).body as { practiceConsentAt: string };
    vi.setSystemTime(Date.now() + 60_000);

    const second = (await accept(session, "scripted")).body as { practiceConsentAt: string };

    expect(second.practiceConsentAt).toBe(first.practiceConsentAt);
  });

  it("accepts only the two kinds the api reports", async () => {
    const { session } = await setup("fake");
    expect((await accept(session, "browser")).status).toBe(400);
    expect((await session.post(CONSENT_PATH).send({ accepted: true })).status).toBe(400);
  });
});
