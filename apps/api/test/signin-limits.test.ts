import type { Request, Response, Router } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LIMITS, MINUTE_MS } from "@pitchperfect/shared";
import { byIp } from "../src/middleware/rate-limit.js";
import {
  DEVICE_COOKIE,
  deviceToken,
  fromKnownDevice,
  isKnownDevice,
  rememberDevice,
} from "../src/modules/auth/known-device.js";
import { makeTestApp } from "./helpers/app.js";
import { csrfAgent, withCsrf, type CsrfAgent } from "./helpers/csrf.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import { createStudent, signIn, TEST_PASSWORD } from "./helpers/factories.js";

useTestDb();

afterEach(() => {
  vi.useRealTimers();
});

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
const { app, config, mailer } = makeTestApp({ env: { TRUST_PROXY: "1" }, extraRoutes });

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

describe("the owner of an email someone is guessing", () => {
  const PREFIX = "198.51.100";

  afterEach(() => {
    mailer.sent.length = 0;
  });

  /** `count` wrong passwords for `email`, each from a new address, from a browser with no history. */
  async function guess(email: string, count = EMAIL_FAILURES) {
    const attacker = await csrfAgent(app);
    for (let i = 0; i < count; i++) {
      await signin(attacker, `${PREFIX}.${String(i + 1)}`, { email, password: WRONG_PASSWORD });
    }
    return attacker;
  }

  /** The owner's browser after one successful sign-in and a sign-out, as on any later visit. */
  async function knownBrowser(email: string, password: string) {
    const browser = await signIn(request.agent(app), email, password);
    await browser.post("/api/auth/signout").expect(204);
    return withCsrf(browser.agent);
  }

  /** The reset token in the most recent email to `to`. */
  function resetTokenSentTo(to: string): string {
    const text = mailer.sent.filter((message) => message.to === to).at(-1)?.text ?? "";
    const token = /\/reset-password\?token=([A-Za-z0-9_-]+)/.exec(text)?.[1];
    if (!token) throw new Error(`no reset link in the last email to ${to}`);
    return token;
  }

  it("still signs in from a browser that signed in before, however many guesses arrive", async () => {
    const { email, password } = await createStudent({ email: "owner@example.test" });
    const browser = await knownBrowser(email, password);

    await guess(email, EMAIL_FAILURES * 3);

    await signin(browser, "192.0.2.50", { email, password }).expect(200);
    // A browser with no sign-in behind it still waits out the window.
    await signin(await csrfAgent(app), "192.0.2.51", { email, password }).expect(429);
  });

  it(`caps guessing at ${String(EMAIL_FAILURES)} even from a browser that signed in before`, async () => {
    const { email, password } = await createStudent({ email: "owner@example.test" });
    const browser = await knownBrowser(email, password);

    for (let i = 0; i < EMAIL_FAILURES; i++) {
      await signin(browser, `${PREFIX}.${String(i + 1)}`, {
        email,
        password: WRONG_PASSWORD,
      }).expect(401);
    }

    const capped = await signin(browser, "192.0.2.52", { email, password: WRONG_PASSWORD });
    expect(capped.status).toBe(429);
    expect(errorOf(capped).code).toBe("rate_limited");
  });

  it("doesn't let a browser that signed in to one account skip the limit on another", async () => {
    const { email, password } = await createStudent({ email: "owner@example.test" });
    const mallory = await createStudent({ email: "mallory@example.test" });
    const browser = await knownBrowser(mallory.email, mallory.password);
    await guess(email);

    await signin(browser, "192.0.2.53", { email, password }).expect(429);
  });

  it("sets the device cookie on sign-in, httpOnly, on Path=/ under its plain name in development", async () => {
    const { email, password } = await createStudent({ email: "owner@example.test" });
    const res = await signin(await csrfAgent(app), "192.0.2.54", { email, password }).expect(200);

    const cookie = ((res.headers["set-cookie"] ?? []) as string[]).find((value) =>
      value.startsWith(`${DEVICE_COOKIE}=`),
    );
    expect(cookie).toMatch(/; Path=\/;/);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).toMatch(new RegExp(`; Max-Age=${String(LIMITS.signinDeviceDays * 86_400)}`));
    expect(cookie).not.toContain("owner");
  });

  it("names the device cookie __Host- in production, Secure on Path=/, and reads it by that name", () => {
    const prod = { SESSION_SECRET: config.SESSION_SECRET, isProd: true };
    const cookie = vi.fn();
    rememberDevice(prod, { cookie } as unknown as Response, "owner@example.test");

    expect(cookie).toHaveBeenCalledWith(
      `__Host-${DEVICE_COOKIE}`,
      expect.any(String),
      expect.objectContaining({ secure: true, path: "/", httpOnly: true }),
    );
    expect(JSON.stringify(cookie.mock.calls[0]?.[2])).not.toMatch(/domain/i);
    const token = cookie.mock.calls[0]?.[1] as string;
    const asRequest = (cookies: Record<string, string>) => ({ cookies }) as unknown as Request;
    expect(
      fromKnownDevice(
        prod,
        asRequest({ [`__Host-${DEVICE_COOKIE}`]: token }),
        "owner@example.test",
      ),
    ).toBe(true);
    expect(fromKnownDevice(prod, asRequest({ [DEVICE_COOKIE]: token }), "owner@example.test")).toBe(
      false,
    );
  });

  it("trusts a device cookie only for its own email, unaltered and unexpired", () => {
    const secret = config.SESSION_SECRET;
    const issuedAt = new Date("2026-03-10T12:00:00Z");
    const token = deviceToken(secret, "owner@example.test", issuedAt);
    const later = (days: number) => new Date(issuedAt.getTime() + days * 86_400_000);

    expect(isKnownDevice(secret, "owner@example.test", token, later(1))).toBe(true);
    expect(isKnownDevice(secret, "mallory@example.test", token, later(1))).toBe(false);
    expect(isKnownDevice(secret, "owner@example.test", `${token.slice(0, -2)}AA`, later(1))).toBe(
      false,
    );
    expect(isKnownDevice("x".repeat(48), "owner@example.test", token, later(1))).toBe(false);
    expect(
      isKnownDevice(secret, "owner@example.test", token, later(LIMITS.signinDeviceDays + 1)),
    ).toBe(false);
    expect(isKnownDevice(secret, "owner@example.test", undefined, later(1))).toBe(false);
  });

  it("emails the owner once per window when the limit trips, with a reset link", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { email } = await createStudent({ email: "owner@example.test" });

    await guess(email, EMAIL_FAILURES + 5);

    await vi.waitFor(() => {
      expect(mailer.sent.filter((message) => message.to === email)).toHaveLength(1);
    });
    expect(resetTokenSentTo(email)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await guess(email, 3);
    expect(mailer.sent.filter((message) => message.to === email)).toHaveLength(1);

    vi.setSystemTime(Date.now() + FAILURE_WINDOW_MS + 1000);
    await guess(email, EMAIL_FAILURES + 1);
    await vi.waitFor(() => {
      expect(mailer.sent.filter((message) => message.to === email)).toHaveLength(2);
    });
  });

  it("sends nothing when the email has no account", async () => {
    await guess("nobody@example.test", EMAIL_FAILURES + 2);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mailer.sent).toHaveLength(0);
  });

  it("lets the owner in on the browser that used the emailed reset link", async () => {
    const { email } = await createStudent({ email: "owner@example.test" });
    await guess(email, EMAIL_FAILURES + 1);
    await vi.waitFor(() => {
      expect(mailer.sent).toHaveLength(1);
    });
    const browser = await csrfAgent(app);
    const password = `${TEST_PASSWORD}-renewed`;

    await browser
      .post("/api/auth/reset-password")
      .send({ token: resetTokenSentTo(email), password })
      .expect(200);

    await signin(browser, "192.0.2.55", { email, password }).expect(200);
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

  it("ignores X-Forwarded-For with the default TRUST_PROXY", async () => {
    const env = { TRUST_PROXY: undefined };
    const { app: plain } = makeTestApp({ env, extraRoutes });
    const keyOf = async (header?: string) => {
      const req = request(plain).get("/api/__test/ip-key");
      const res = header === undefined ? await req : await req.set("X-Forwarded-For", header);
      return (res.body as { key: string }).key;
    };

    const own = await keyOf();
    for (const spoof of SPOOFS) {
      expect(await keyOf(spoof)).toBe(own);
      expect(await keyOf(`${spoof}, ${CLIENT}`)).toBe(own);
    }

    const agent = await csrfAgent(plain);
    const { email } = await createStudent();
    for (const spoof of SPOOFS) {
      await agent
        .post("/api/auth/signin")
        .set("X-Forwarded-For", spoof)
        .send({ email, password: WRONG_PASSWORD })
        .expect(401);
    }
    const blocked = await agent
      .post("/api/auth/signin")
      .set("X-Forwarded-For", "198.51.100.99")
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
