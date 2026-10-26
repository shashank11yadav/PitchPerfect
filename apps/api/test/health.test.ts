import mongoose from "mongoose";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COACH_PROBE_TTL_MS } from "../src/services/coach-probe.js";
import { makeTestApp } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";
import { prodEnv } from "./helpers/env.js";
import { FakeCoachClient } from "./helpers/fake-coach.js";

useTestDb();

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("GET /api/health", () => {
  it("reports ok for the api, database, and coach, and the scripted demo partner", async () => {
    const { app } = makeTestApp();
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "ok", coach: "ok", practicePartner: "scripted" });
  });

  it("reports a live partner when the coach runs a real provider", async () => {
    const { app } = makeTestApp({ coach: new FakeCoachClient("ok", "openai") });
    const res = await request(app).get("/api/health");

    expect(res.body).toMatchObject({ coach: "ok", practicePartner: "live" });
  });

  it("reports the coach as down without failing the request, and the partner as live", async () => {
    const { app } = makeTestApp({ coach: new FakeCoachClient("down") });
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "ok", coach: "down", practicePartner: "live" });
  });

  it("asks the coach once per 30 s, however often health is checked", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const coach = new FakeCoachClient();
    const health = vi.spyOn(coach, "health");
    const { app } = makeTestApp({ coach });

    await request(app).get("/api/health");
    await request(app).get("/api/health");
    expect(health).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + COACH_PROBE_TTL_MS + 1);
    coach.healthStatus = "down";
    const res = await request(app).get("/api/health");
    expect(health).toHaveBeenCalledTimes(2);
    expect(res.body).toMatchObject({ coach: "down", practicePartner: "live" });
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
    expect(res.body).toEqual({
      status: "ok",
      db: "down",
      coach: "ok",
      practicePartner: "scripted",
    });
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

  it("echoes a well-formed incoming request id and replaces a malformed one", async () => {
    const { app } = makeTestApp();
    const kept = await request(app).get("/api/health").set("x-request-id", "client-req-12345");
    const replaced = await request(app)
      .get("/api/health")
      .set("x-request-id", "bad id\twith space");

    expect(kept.headers["x-request-id"]).toBe("client-req-12345");
    expect(replaced.headers["x-request-id"]).not.toBe("bad id\twith space");
    expect(replaced.headers["x-request-id"]).toMatch(/^[\w-]{8,64}$/);
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
