import { signRequest } from "@pitchperfect/shared/hmac";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildCoachApp } from "../src/app.js";
import { loadCoachConfig } from "../src/config.js";
import { devEnv } from "./helpers/env.js";

const config = loadCoachConfig(devEnv());
const nowSec = () => Math.floor(Date.now() / 1000);
const sign = (
  path: string,
  payload: string,
  at = nowSec(),
  method = "POST",
  secret = config.COACH_SHARED_SECRET,
) => signRequest(secret, { method, path, body: payload }, at);

let app: FastifyInstance | undefined;

function build(): FastifyInstance {
  app = buildCoachApp({ config });
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("GET /healthz", () => {
  it("answers unsigned with the status and provider", async () => {
    const res = await build().inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", provider: "fake" });
  });
});

describe("HEAD /healthz", () => {
  it("is not a public route", async () => {
    const res = await build().inject({ method: "HEAD", url: "/healthz" });
    expect(res.statusCode).toBe(401);
  });
});

describe("request authentication", () => {
  const body = JSON.stringify({ skill: "pitching" });

  it("rejects an unsigned POST /v1/plan with 401", async () => {
    const res = await build().inject({
      method: "POST",
      url: "/v1/plan",
      headers: { "content-type": "application/json" },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: { code: "unauthenticated" } });
  });

  it("rejects unsigned requests of any shape before parsing them", async () => {
    const instance = build();
    const cases = [
      { method: "POST", url: "/v1/plan", payload: "{not json", type: "application/json" },
      { method: "POST", url: "/v1/plan", payload: "plain", type: "text/plain" },
      { method: "POST", url: "/v1/turn", payload: undefined, type: undefined },
      { method: "GET", url: "/v1/anything", payload: undefined, type: undefined },
      { method: "GET", url: "/healthz/", payload: undefined, type: undefined },
    ] as const;
    for (const { method, url, payload, type } of cases) {
      const res = await instance.inject({
        method,
        url,
        payload,
        headers: type ? { "content-type": type } : {},
      });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
      expect(res.json()).toEqual({ error: { code: "unauthenticated" } });
    }
  });

  it("rejects a wrong signature and a stale timestamp with 401", async () => {
    const instance = build();
    const wrong = sign("/v1/plan", body, nowSec(), "POST", "another-secret-another-secret-0000000");
    const stale = sign("/v1/plan", body, nowSec() - 61);
    for (const headers of [wrong, stale]) {
      const res = await instance.inject({
        method: "POST",
        url: "/v1/plan",
        headers: { "content-type": "application/json", ...headers },
        payload: body,
      });
      expect(res.statusCode).toBe(401);
    }
  });

  it("rejects a body that differs from the one that was signed", async () => {
    const headers = sign("/v1/plan", body);
    const res = await build().inject({
      method: "POST",
      url: "/v1/plan",
      headers: { "content-type": "application/json", ...headers },
      payload: JSON.stringify({ skill: "next-steps" }),
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a signature made for a different path or method", async () => {
    const instance = build();
    const forPlan = sign("/v1/plan", body);
    const forGet = sign("/v1/plan", body, nowSec(), "GET");
    const attempts = [
      { url: "/v1/score", headers: forPlan },
      { url: "/v1/plan", headers: forGet },
    ];
    for (const { url, headers } of attempts) {
      const res = await instance.inject({
        method: "POST",
        url,
        headers: { "content-type": "application/json", ...headers },
        payload: body,
      });
      expect(res.statusCode, url).toBe(401);
    }
  });

  it("ignores the query string when checking the path", async () => {
    const res = await build().inject({
      method: "POST",
      url: "/v1/plan?x=1&y=2",
      headers: { "content-type": "application/json", ...sign("/v1/plan", body) },
      payload: body,
    });
    expect(res.statusCode).toBe(404);
  });

  it("lets a signed request through to routing", async () => {
    const headers = sign("/v1/plan", body);
    const res = await build().inject({
      method: "POST",
      url: "/v1/plan",
      headers: { "content-type": "application/json", ...headers },
      payload: body,
    });
    // No plan route exists yet; reaching a 404 proves authentication passed.
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: "not_found" } });
  });

  it("hands signed JSON bodies to handlers parsed, and rejects malformed JSON with 400", async () => {
    const instance = build();
    instance.post("/v1/echo", (request) => ({ got: request.body }));

    const ok = await instance.inject({
      method: "POST",
      url: "/v1/echo",
      headers: { "content-type": "application/json", ...sign("/v1/echo", body) },
      payload: body,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ got: { skill: "pitching" } });

    const bad = await instance.inject({
      method: "POST",
      url: "/v1/echo",
      headers: { "content-type": "application/json", ...sign("/v1/echo", "{nope") },
      payload: "{nope",
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ error: { code: "validation_failed" } });
  });

  it("treats application/jsonx as non-JSON", async () => {
    const instance = build();
    instance.post("/v1/echo", (request) => ({ got: request.body }));
    const res = await instance.inject({
      method: "POST",
      url: "/v1/echo",
      headers: { "content-type": "application/jsonx", ...sign("/v1/echo", body) },
      payload: body,
    });
    expect(res.statusCode).toBe(415);
  });

  it("accepts a JSON content type with parameters", async () => {
    const instance = build();
    instance.post("/v1/echo", (request) => ({ got: request.body }));
    const res = await instance.inject({
      method: "POST",
      url: "/v1/echo",
      headers: { "content-type": "application/json; charset=utf-8", ...sign("/v1/echo", body) },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
  });

  it("rejects a signed non-JSON content type with 415", async () => {
    const instance = build();
    instance.post("/v1/echo", (request) => ({ got: request.body }));
    const res = await instance.inject({
      method: "POST",
      url: "/v1/echo",
      headers: {
        "content-type": "text/plain",
        ...sign("/v1/echo", "hello"),
      },
      payload: "hello",
    });
    expect(res.statusCode).toBe(415);
  });

  it("rejects bodies over 256 kB with 413", async () => {
    const big = JSON.stringify({ text: "x".repeat(262_144) });
    const res = await build().inject({
      method: "POST",
      url: "/v1/plan",
      headers: {
        "content-type": "application/json",
        ...sign("/v1/plan", big),
      },
      payload: big,
    });
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ error: { code: "payload_too_large" } });
  });
});
