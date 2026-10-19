import type { Router } from "express";
import mongoose from "mongoose";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  BudgetExhaustedError,
  ConflictError,
  ForbiddenError,
  InvalidCredentialsError,
  NotFoundError,
  PayloadTooLargeError,
  PracticeUnavailableError,
  QuotaExceededError,
  RateLimitedError,
  UnauthenticatedError,
  UnsupportedFileError,
  UpstreamError,
  ValidationError,
} from "../src/errors.js";
import { User } from "../src/db/models/index.js";
import { getInput, validate } from "../src/middleware/validate.js";
import { makeTestApp } from "./helpers/app.js";
import { csrfAgent } from "./helpers/csrf.js";
import { errorOf } from "./helpers/error-body.js";

const thrown: (() => Error)[] = [
  () => new ValidationError({ email: "Enter a valid email" }),
  () => new UnauthenticatedError(),
  () => new InvalidCredentialsError(),
  () => new ForbiddenError(),
  () => new ForbiddenError("csrf_failed"),
  () => new NotFoundError(),
  () => new ConflictError("conflict"),
  () => new ConflictError("email_taken"),
  () => new RateLimitedError(30),
  () => new QuotaExceededError(3600),
  () => new BudgetExhaustedError(7200),
  () => new UpstreamError(),
  () => new PracticeUnavailableError(),
  () => new PayloadTooLargeError(),
  () => new UnsupportedFileError(),
];

const echoSchema = z.object({ name: z.string().min(1) }).strict();

function extraRoutes(router: Router): void {
  router.get("/__test/throw/:index", (req, _res, next) => {
    const create = thrown[Number(req.params.index)];
    next(create?.());
  });
  router.get("/__test/not-found", () => {
    throw new NotFoundError();
  });
  router.get("/__test/boom", () => {
    throw new Error("db password xyz");
  });
  router.get("/__test/cast", () => {
    throw new mongoose.Error.CastError("ObjectId", "abc", "_id");
  });
  router.get("/__test/mongoose-validation", async () => {
    await new User({ email: "not-an-email-but-no-role", role: "admin" }).validate();
  });
  router.get("/__test/duplicate", () => {
    throw Object.assign(new Error("E11000 duplicate key collection: pitchperfect.users"), {
      code: 11000,
    });
  });
  router.post("/__test/echo", validate({ body: echoSchema }), (_req, res) => {
    res.json(getInput<{ body: typeof echoSchema }>(res).body);
  });
  router.get(
    "/__test/items/:id",
    validate({
      params: z.object({ id: z.string().regex(/^\d+$/) }).strict(),
      query: z.object({ page: z.coerce.number().int().min(1).default(1) }).strict(),
    }),
    (_req, res) => {
      res.json(getInput(res));
    },
  );
}

const { app } = makeTestApp({ extraRoutes });

describe("error handling", () => {
  it("maps NotFoundError to the standard 404 body with the request id", async () => {
    const res = await request(app).get("/api/__test/not-found");

    expect(res.status).toBe(404);
    const error = errorOf(res);
    expect(error.code).toBe("not_found");
    expect(error.message).toBeTruthy();
    expect(error.requestId).toBe(res.get("x-request-id"));
  });

  it("returns a JSON 404 for unknown routes", async () => {
    for (const path of ["/api/nope", "/nope"]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(404);
      expect(res.type).toBe("application/json");
      expect(errorOf(res).code).toBe("not_found");
    }
  });

  it("returns 400 validation_failed for malformed JSON", async () => {
    const res = await request(app)
      .post("/api/__test/echo")
      .set("content-type", "application/json")
      .send('{"name":');

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe("validation_failed");
  });

  it("returns 413 for a body over 100 kB", async () => {
    const res = await request(app)
      .post("/api/__test/echo")
      .send({ name: "x".repeat(101 * 1024) });

    expect(res.status).toBe(413);
    expect(errorOf(res).code).toBe("file_too_large");
  });

  it("does not leak the message of unexpected errors", async () => {
    const res = await request(app).get("/api/__test/boom");

    expect(res.status).toBe(500);
    expect(errorOf(res).code).toBe("internal_error");
    expect(errorOf(res).message).toBe("Something went wrong");
    expect(JSON.stringify(res.body)).not.toContain("xyz");
    expect(errorOf(res).requestId).toBe(res.headers["x-request-id"]);
  });

  it("maps a Mongoose CastError to 400 invalid_id", async () => {
    const res = await request(app).get("/api/__test/cast");

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe("invalid_id");
  });

  it("maps a Mongoose ValidationError to 400 validation_failed with per-path fields", async () => {
    const res = await request(app).get("/api/__test/mongoose-validation");

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe("validation_failed");
    expect(Object.keys(errorOf(res).fields ?? {})).toEqual(
      expect.arrayContaining(["role", "passwordHash", "name.first"]),
    );
    expect(JSON.stringify(res.body)).not.toContain("ValidatorError");
  });

  it("maps a duplicate key error to 409 conflict without leaking details", async () => {
    const res = await request(app).get("/api/__test/duplicate");

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe("conflict");
    expect(JSON.stringify(res.body)).not.toContain("E11000");
  });

  it.each([
    [0, 400, "validation_failed"],
    [1, 401, "unauthenticated"],
    [2, 401, "invalid_credentials"],
    [3, 403, "forbidden"],
    [4, 403, "csrf_failed"],
    [5, 404, "not_found"],
    [6, 409, "conflict"],
    [7, 409, "email_taken"],
    [8, 429, "rate_limited"],
    [9, 429, "quota_exceeded"],
    [10, 429, "budget_exhausted"],
    [11, 502, "upstream_error"],
    [12, 503, "practice_unavailable"],
    [13, 413, "file_too_large"],
    [14, 415, "unsupported_file"],
  ])("maps typed error #%i to %i %s", async (index, status, code) => {
    const res = await request(app).get(`/api/__test/throw/${String(index)}`);

    expect(res.status).toBe(status);
    expect(errorOf(res).code).toBe(code);
  });

  it("includes field errors and Retry-After where relevant", async () => {
    const invalid = await request(app).get("/api/__test/throw/0");
    expect(errorOf(invalid).fields).toEqual({ email: "Enter a valid email" });

    const limited = await request(app).get("/api/__test/throw/8");
    expect(limited.headers["retry-after"]).toBe("30");
    const quota = await request(app).get("/api/__test/throw/9");
    expect(quota.headers["retry-after"]).toBe("3600");
  });
});

describe("validate()", () => {
  it("stores parsed params, query, and body on res.locals.input", async () => {
    const res = await request(app).get("/api/__test/items/42?page=3");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ params: { id: "42" }, query: { page: 3 } });
  });

  it("applies schema defaults", async () => {
    const res = await request(app).get("/api/__test/items/42");
    expect(res.body).toEqual({ params: { id: "42" }, query: { page: 1 } });
  });

  it("responds 400 with per-field errors for invalid input", async () => {
    const res = await request(app).get("/api/__test/items/abc?page=0");

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe("validation_failed");
    expect(Object.keys(errorOf(res).fields ?? {})).toEqual(expect.arrayContaining(["id", "page"]));
  });

  it("rejects unknown keys when the schema is strict", async () => {
    const res = await (
      await csrfAgent(app)
    )
      .post("/api/__test/echo")
      .send({ name: "Ada", admin: true });

    expect(res.status).toBe(400);
    expect(errorOf(res).fields).toHaveProperty("admin");
  });

  it("returns the parsed body on success", async () => {
    const res = await (await csrfAgent(app)).post("/api/__test/echo").send({ name: "Ada" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: "Ada" });
  });

  it("treats a missing body as empty input", async () => {
    const res = await (await csrfAgent(app)).post("/api/__test/echo");

    expect(res.status).toBe(400);
    expect(errorOf(res).fields).toHaveProperty("name");
  });
});
