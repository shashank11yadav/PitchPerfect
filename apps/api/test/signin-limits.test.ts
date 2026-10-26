import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTestApp } from "./helpers/app.js";
import { csrfAgent, type CsrfAgent } from "./helpers/csrf.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import { createStudent } from "./helpers/factories.js";

useTestDb();

afterEach(() => {
  vi.useRealTimers();
});

const MINUTE_MS = 60 * 1000;
const WRONG_PASSWORD = "copper-meadow-signal-58";
/** Failed sign-ins one address may make across all emails, and one email across all addresses. */
const IP_FAILURES = 30;
const EMAIL_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * MINUTE_MS;

// One trusted hop, so each test can pick the client address with X-Forwarded-For.
const { app } = makeTestApp({ env: { TRUST_PROXY: "1" } });

const signin = (agent: CsrfAgent, from: string, body: { email: string; password: string }) =>
  agent.post("/api/auth/signin").set("X-Forwarded-For", from).send(body);

/** The error envelope without the per-request id, for comparing two responses. */
function errorWithoutId(res: { body: unknown }) {
  const { code, message, fields } = errorOf(res);
  return { code, message, fields };
}

describe("failed sign-ins from one address across many emails", () => {
  it(`allows ${String(IP_FAILURES)} in 15 minutes, then refuses that address`, async () => {
    const agent = await csrfAgent(app);
    for (let i = 0; i < IP_FAILURES; i++) {
      const res = await signin(agent, "203.0.113.7", {
        email: `guess-${String(i)}@example.test`,
        password: WRONG_PASSWORD,
      });
      expect(res.status).toBe(401);
    }

    const { email, password } = await createStudent();
    const blocked = await signin(agent, "203.0.113.7", { email, password });
    expect(blocked.status).toBe(429);
    expect(errorOf(blocked).code).toBe("rate_limited");
    const retryAfter = Number(blocked.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(FAILURE_WINDOW_MS / 1000);

    // Other addresses keep their own budget.
    await signin(agent, "198.51.100.9", { email, password }).expect(200);
  });

  it("never counts successful sign-ins, so a shared address isn't blocked by its own users", async () => {
    const agent = await csrfAgent(app);
    const from = "203.0.113.20";
    for (let i = 0; i < IP_FAILURES - 1; i++) {
      await signin(agent, from, {
        email: `typo-${String(i)}@example.test`,
        password: WRONG_PASSWORD,
      }).expect(401);
    }
    // Each user signs in from their own browser behind the same address.
    for (let i = 0; i < 3; i++) {
      const student = await createStudent();
      const browser = await csrfAgent(app);
      await signin(browser, from, { email: student.email, password: student.password }).expect(200);
    }

    await signin(agent, from, { email: "last@example.test", password: WRONG_PASSWORD }).expect(401);
    const blocked = await signin(agent, from, {
      email: "one-more@example.test",
      password: WRONG_PASSWORD,
    });
    expect(blocked.status).toBe(429);
  });
});

describe("failed sign-ins to one email from many addresses", () => {
  /** `EMAIL_FAILURES` wrong passwords for `email`, each from a new address. */
  async function failFromManyAddresses(agent: CsrfAgent, email: string, prefix: string) {
    for (let i = 0; i < EMAIL_FAILURES; i++) {
      const res = await signin(agent, `${prefix}.${String(i + 1)}`, {
        email,
        password: WRONG_PASSWORD,
      });
      expect(res.status).toBe(401);
    }
  }

  it(`allows ${String(EMAIL_FAILURES)} in 15 minutes, then slows that email down`, async () => {
    const { email, password } = await createStudent({ email: "target@example.test" });
    const agent = await csrfAgent(app);
    await failFromManyAddresses(agent, email, "198.51.100");

    // Even the right password from a fresh address waits: the throttle is on the email.
    const blocked = await signin(agent, "192.0.2.200", { email, password });
    expect(blocked.status).toBe(429);
    expect(errorOf(blocked).code).toBe("rate_limited");
    const retryAfter = Number(blocked.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(FAILURE_WINDOW_MS / 1000);

    // Other emails are untouched.
    const other = await createStudent();
    await signin(agent, "192.0.2.200", { email: other.email, password: other.password }).expect(
      200,
    );
  });

  it("lets the owner back in once the window has passed: a wait, not a lockout", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { email, password } = await createStudent({ email: "owner@example.test" });
    const agent = await csrfAgent(app);
    await failFromManyAddresses(agent, email, "198.51.100");
    await signin(agent, "192.0.2.10", { email, password }).expect(429);

    vi.setSystemTime(Date.now() + FAILURE_WINDOW_MS + 1000);

    await signin(agent, "192.0.2.10", { email, password }).expect(200);
  });

  it("answers an unknown email exactly like a registered one", async () => {
    await createStudent({ email: "known@example.test" });
    const agent = await csrfAgent(app);
    await failFromManyAddresses(agent, "known@example.test", "198.51.100");
    await failFromManyAddresses(agent, "unknown@example.test", "203.0.113");

    const known = await signin(agent, "192.0.2.30", {
      email: "known@example.test",
      password: WRONG_PASSWORD,
    });
    const unknown = await signin(agent, "192.0.2.31", {
      email: "unknown@example.test",
      password: WRONG_PASSWORD,
    });
    expect(known.status).toBe(429);
    expect(unknown.status).toBe(429);
    expect(errorWithoutId(known)).toEqual(errorWithoutId(unknown));
    expect(Object.keys(known.headers).sort()).toEqual(Object.keys(unknown.headers).sort());
  });

  it("leaves a user who mistypes a few times alone", async () => {
    const { email, password } = await createStudent();
    const agent = await csrfAgent(app);
    for (const from of ["192.0.2.40", "192.0.2.40", "198.51.100.40"]) {
      await signin(agent, from, { email, password: WRONG_PASSWORD }).expect(401);
    }
    await signin(agent, "198.51.100.40", { email, password }).expect(200);
  });
});
