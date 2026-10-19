import request from "supertest";
import { describe, expect, it } from "vitest";
import { makeTestApp } from "./helpers/app.js";
import { errorOf } from "./helpers/error-body.js";

const PROXY_SECRET = "p".repeat(40);

describe("x-pp-proxy guard", () => {
  it("lets requests through when no proxy secret is configured", async () => {
    const res = await request(makeTestApp().app).get("/api/health");
    expect(res.status).toBe(200);
  });

  it("rejects requests without the header when a proxy secret is configured", async () => {
    const { app } = makeTestApp({ env: { PROXY_SHARED_SECRET: PROXY_SECRET } });
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("forbidden");
  });

  it("rejects a wrong header value", async () => {
    const { app } = makeTestApp({ env: { PROXY_SHARED_SECRET: PROXY_SECRET } });
    const res = await request(app).get("/api/health").set("x-pp-proxy", "q".repeat(40));
    expect(res.status).toBe(403);
  });

  it("accepts the correct header value", async () => {
    const { app } = makeTestApp({ env: { PROXY_SHARED_SECRET: PROXY_SECRET } });
    const res = await request(app).get("/api/health").set("x-pp-proxy", PROXY_SECRET);
    expect(res.status).toBe(200);
  });
});
