import mongoose from "mongoose";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COACH_PROBE_TTL_MS } from "../src/services/coach-probe.js";
import { makeTestApp } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";
import { PROD_PROXY_SECRET, prodEnv } from "./helpers/env.js";
import { FakeCoachClient } from "./helpers/fake-coach.js";

useTestDb();

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("GET /api/health", () => {
  it("reports liveness only: the api, the database and the coach, nothing about the setup", async () => {
    const { app } = makeTestApp();
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "ok", coach: "ok" });
  });

  it("doesn't name the partner, whichever provider the coach runs", async () => {
    for (const provider of ["fake", "openai"]) {
      const { app } = makeTestApp({ coach: new FakeCoachClient("ok", provider) });
      const res = await request(app).get("/api/health");
      expect(res.body).toEqual({ status: "ok", db: "ok", coach: "ok" });
    }
  });

  it("reports the coach as down without failing the request", async () => {
    const { app } = makeTestApp({ coach: new FakeCoachClient("down") });
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "ok", coach: "down" });
  });

  it("asks the coach once per 30 s, however often health is checked", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const coach = new FakeCoachClient();
    const health = vi.spyOn(coach, "health");
    const { app } = makeTestApp({ coach });

    await request(app).get("/api/health");
    await request(app).get("/api/practice/partner");
    expect(health).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + COACH_PROBE_TTL_MS + 1);
    coach.healthStatus = "down";
    const res = await request(app).get("/api/health");
    expect(health).toHaveBeenCalledTimes(2);
    expect(res.body).toMatchObject({ coach: "down" });
  });

  it("answers 429 after 120 checks a minute from one address", async () => {
    const { app } = makeTestApp();
    const statuses: number[] = [];
    for (let i = 0; i < 121; i += 1) statuses.push((await request(app).get("/api/health")).status);

    expect(statuses.slice(0, 120).every((status) => status === 200)).toBe(true);
    expect(statuses[120]).toBe(429);
  });

  it("reports the database as down when mongoose is not connected", async () => {
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(
      mongoose.ConnectionStates.disconnected,
    );
    const { app } = makeTestApp();
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "down", coach: "ok" });
  });

  it("sets a request id and security headers and hides the framework", async () => {
    const { app } = makeTestApp();
    const res = await request(app).get("/api/health");

    expect(res.headers["x-request-id"]).toMatch(/^[\w-]{8,64}$/);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("ignores a request id the client chose, however well-formed", async () => {
    const { app } = makeTestApp();
    const res = await request(app).get("/api/health").set("x-request-id", "client-req-12345");

    expect(res.headers["x-request-id"]).not.toBe("client-req-12345");
    expect(res.headers["x-request-id"]).toMatch(/^[\w-]{8,64}$/);
  });

  it("keeps a well-formed request id only from the web proxy, which sends the proxy secret", async () => {
    const { app } = makeTestApp({ env: prodEnv() });
    const fromProxy = (id: string, secret = PROD_PROXY_SECRET) =>
      request(app).get("/api/health").set("x-pp-proxy", secret).set("x-request-id", id);

    const kept = await fromProxy("proxy-req-12345");
    const malformed = await fromProxy("bad id\twith space");
    const forged = await fromProxy("forged-req-12345", "q".repeat(48));
    const noSecret = await request(app).get("/api/health").set("x-request-id", "client-req-12345");

    expect(kept.headers["x-request-id"]).toBe("proxy-req-12345");
    for (const res of [malformed, forged, noSecret]) {
      expect(["bad id\twith space", "forged-req-12345", "client-req-12345"]).not.toContain(
        res.headers["x-request-id"],
      );
      expect(res.headers["x-request-id"]).toMatch(/^[\w-]{8,64}$/);
    }
  });

  it("sends HSTS only in production", async () => {
    const dev = await request(makeTestApp().app).get("/api/health");
    expect(dev.headers["strict-transport-security"]).toBeUndefined();

    const prod = makeTestApp({ env: prodEnv() });
    const res = await request(prod.app).get("/api/health");
    expect(res.headers["strict-transport-security"]).toContain("max-age=");
  });

  it("sends HSTS when NODE_ENV is unset, which counts as production", async () => {
    const unset = makeTestApp({ env: prodEnv({ NODE_ENV: undefined }) });
    const res = await request(unset.app).get("/api/health");
    expect(res.headers["strict-transport-security"]).toContain("max-age=");
  });
});

describe("GET /api/practice/partner", () => {
  it("discloses the scripted partner to anyone, with caching headers", async () => {
    const { app } = makeTestApp();
    const res = await request(app).get("/api/practice/partner");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ practicePartner: "scripted" });
    expect(res.get("cache-control")).toBe("public, max-age=30");
  });

  it("reports a live partner for a real provider, and for a coach that is down", async () => {
    const live = makeTestApp({ coach: new FakeCoachClient("ok", "openai") });
    expect((await request(live.app).get("/api/practice/partner")).body).toEqual({
      practicePartner: "live",
    });

    const down = makeTestApp({ coach: new FakeCoachClient("down") });
    expect((await request(down.app).get("/api/practice/partner")).body).toEqual({
      practicePartner: "live",
    });
  });

  it("answers 429 after 120 requests a minute from one address", async () => {
    const { app } = makeTestApp();
    const statuses: number[] = [];
    for (let i = 0; i < 121; i += 1) {
      statuses.push((await request(app).get("/api/practice/partner")).status);
    }

    expect(statuses.slice(0, 120).every((status) => status === 200)).toBe(true);
    expect(statuses[120]).toBe(429);
  });
});
