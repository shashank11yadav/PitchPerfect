import type { Router } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byIp } from "../src/middleware/rate-limit.js";
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

function extraRoutes(router: Router): void {
  router.get("/__test/ip-key", (req, res) => {
    res.json({ key: byIp(req) });
  });
}

// One trusted hop, so each test can pick the client address with X-Forwarded-For.
const { app } = makeTestApp({ env: { TRUST_PROXY: "1" }, extraRoutes });

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

describe("the client address behind proxies (docs/deploy.md)", () => {
  const CLIENT = "203.0.113.7";
  const SPOOFS = ["198.51.100.1", "198.51.100.2", "198.51.100.3", "198.51.100.4", "10.0.0.1"];

  /**
   * Each documented deploy shape: its `TRUST_PROXY`, and the X-Forwarded-For the api receives when
   * the client sent one of its own (`spoof`).
   */
  const SHAPES = [
    // Vercel replaces the header with the client's address; the api host's router appends Vercel's.
    [
      "web on Vercel, api on Render or Fly.io",
      "2",
      (spoof: string) => `${spoof}, ${CLIENT}, 192.0.2.10`,
    ],
    // nginx appends the client's address; next start forwards the header as it came.
    ["nginx (appending), then next start", "1", (spoof: string) => `${spoof}, ${CLIENT}`],
    // nginx replaces the header with the client's address.
    ["nginx (replacing), then next start", "1", () => CLIENT],
  ] as const;

  it.each(SHAPES)("%s: the limiter keys on the real client", async (_shape, trust, header) => {
    const { app: shaped } = makeTestApp({ env: { TRUST_PROXY: trust }, extraRoutes });
    const agent = await csrfAgent(shaped);
    for (const spoof of SPOOFS) {
      const res = await agent.agent.get("/api/__test/ip-key").set("X-Forwarded-For", header(spoof));
      expect((res.body as { key: string }).key).toBe(CLIENT);
    }

    const { email } = await createStudent();
    for (const spoof of SPOOFS) {
      await agent
        .post("/api/auth/signin")
        .set("X-Forwarded-For", header(spoof))
        .send({ email, password: WRONG_PASSWORD })
        .expect(401);
    }
    const blocked = await agent
      .post("/api/auth/signin")
      .set("X-Forwarded-For", header("198.51.100.99"))
      .send({ email, password: WRONG_PASSWORD });
    expect(blocked.status).toBe(429);
  });

  it("lets the client choose its address when TRUST_PROXY is one hop too many", async () => {
    const [, trust, header] = SHAPES[0];
    const { app: tooTrusting } = makeTestApp({
      env: { TRUST_PROXY: String(Number(trust) + 1) },
      extraRoutes,
    });
    const res = await request(tooTrusting)
      .get("/api/__test/ip-key")
      .set("X-Forwarded-For", header("198.51.100.1"));
    expect((res.body as { key: string }).key).toBe("198.51.100.1");
  });

  it("keys on the trusted subnet's client when TRUST_PROXY is a subnet list", async () => {
    // supertest connects from loopback; the second hop is the platform router.
    const { app: bySubnet } = makeTestApp({
      env: { TRUST_PROXY: "127.0.0.1/8, ::1, 192.0.2.0/24" },
      extraRoutes,
    });
    const res = await request(bySubnet)
      .get("/api/__test/ip-key")
      .set("X-Forwarded-For", `198.51.100.1, ${CLIENT}, 192.0.2.10`);
    expect((res.body as { key: string }).key).toBe(CLIENT);
  });
});
