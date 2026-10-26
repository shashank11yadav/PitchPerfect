import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HOUR_MS } from "@pitchperfect/shared";
import { AuthToken } from "../db/models/index.js";
import { ValidationError } from "../errors.js";
import { useTestDb } from "../../test/helpers/db.js";
import { consumeToken, createToken, peekToken } from "./tokens.js";

useTestDb();

afterEach(() => {
  vi.useRealTimers();
});

const newUserId = () => new mongoose.Types.ObjectId().toString();
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

async function expectInvalid(promise: Promise<unknown>) {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ValidationError);
  expect(error).toMatchObject({ code: "invalid_token", status: 400 });
}

describe("createToken", () => {
  it("returns a 32-byte random token and stores only its sha256", async () => {
    const userId = newUserId();
    const raw = await createToken(userId, "verify_email", HOUR_MS);

    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const docs = await AuthToken.find().lean();
    expect(docs).toHaveLength(1);
    expect(docs[0]?.tokenHash).toBe(sha256(raw));
    expect(JSON.stringify(docs)).not.toContain(raw);
    expect(docs[0]?.userId.toString()).toBe(userId);
    expect(docs[0]?.type).toBe("verify_email");
  });

  it("sets the expiry from the ttl", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-01T10:00:00Z"));
    await createToken(newUserId(), "reset_password", 30 * 60 * 1000);

    const doc = await AuthToken.findOne().lean();
    expect(doc?.expiresAt.toISOString()).toBe("2026-03-01T10:30:00.000Z");
  });

  it("issues different tokens each time", async () => {
    const userId = newUserId();
    const first = await createToken(userId, "verify_email", HOUR_MS);
    const second = await createToken(userId, "verify_email", HOUR_MS);
    expect(first).not.toBe(second);
  });

  it("invalidates older unused tokens of the same type for that user only", async () => {
    const userId = newUserId();
    const old = await createToken(userId, "verify_email", HOUR_MS);
    const reset = await createToken(userId, "reset_password", HOUR_MS);
    const otherUser = await createToken(newUserId(), "verify_email", HOUR_MS);
    const latest = await createToken(userId, "verify_email", HOUR_MS);

    await expectInvalid(consumeToken(old, "verify_email"));
    expect(await consumeToken(latest, "verify_email")).toBe(userId);
    expect(await consumeToken(reset, "reset_password")).toBe(userId);
    expect(typeof (await consumeToken(otherUser, "verify_email"))).toBe("string");
  });
});

describe("consumeToken", () => {
  it("returns the user id once, then rejects reuse", async () => {
    const userId = newUserId();
    const raw = await createToken(userId, "verify_email", HOUR_MS);

    expect(await consumeToken(raw, "verify_email")).toBe(userId);
    await expectInvalid(consumeToken(raw, "verify_email"));
    const doc = await AuthToken.findOne().lean();
    expect(doc?.usedAt).toBeInstanceOf(Date);
  });

  it("rejects unknown tokens and tokens of another type", async () => {
    const raw = await createToken(newUserId(), "verify_email", HOUR_MS);

    await expectInvalid(consumeToken("not-a-token", "verify_email"));
    await expectInvalid(consumeToken(raw, "reset_password"));
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const raw = await createToken(newUserId(), "verify_email", HOUR_MS);
    vi.setSystemTime(Date.now() + HOUR_MS + 1000);

    await expectInvalid(consumeToken(raw, "verify_email"));
  });

  it("lets only one of two concurrent uses succeed", async () => {
    const raw = await createToken(newUserId(), "reset_password", HOUR_MS);
    const results = await Promise.allSettled([
      consumeToken(raw, "reset_password"),
      consumeToken(raw, "reset_password"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });

  it("is not fooled by query operators in place of a token", async () => {
    await createToken(newUserId(), "verify_email", HOUR_MS);
    await expectInvalid(consumeToken({ $ne: "" } as unknown as string, "verify_email"));
  });
});

describe("peekToken", () => {
  it("returns the user id of a valid token without using it up", async () => {
    const userId = newUserId();
    const raw = await createToken(userId, "reset_password", HOUR_MS);

    expect(await peekToken(raw, "reset_password")).toBe(userId);
    expect(await consumeToken(raw, "reset_password")).toBe(userId);
    await expectInvalid(peekToken(raw, "reset_password"));
  });
});
