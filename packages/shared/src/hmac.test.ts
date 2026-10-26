import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signRequest } from "./hmac.js";

const SECRET = "test-only-secret-for-signing-0000000000000";
const REQUEST = { method: "POST", path: "/v1/plan", body: '{"a":1}' };
const NONCE = "0123456789abcdef0123456789abcdef";

describe("signRequest", () => {
  it("signs `${timestamp}.${nonce}.${METHOD}.${path}.${body}` with HMAC-SHA256 and returns hex", () => {
    const headers = signRequest(SECRET, REQUEST, 1_700_000_000, NONCE);
    const expected = createHmac("sha256", SECRET)
      .update(`1700000000.${NONCE}.POST./v1/plan.{"a":1}`)
      .digest("hex");
    expect(headers).toEqual({
      "x-pp-timestamp": "1700000000",
      "x-pp-nonce": NONCE,
      "x-pp-signature": expected,
    });
  });

  it("gives every request a fresh 128-bit nonce", () => {
    const first = signRequest(SECRET, REQUEST, 100);
    const second = signRequest(SECRET, REQUEST, 100);
    expect(first["x-pp-nonce"]).toMatch(/^[0-9a-f]{32}$/);
    expect(second["x-pp-nonce"]).not.toBe(first["x-pp-nonce"]);
    expect(second["x-pp-signature"]).not.toBe(first["x-pp-signature"]);
  });

  it("uppercases the method", () => {
    expect(signRequest(SECRET, { ...REQUEST, method: "post" }, 100, NONCE)).toEqual(
      signRequest(SECRET, REQUEST, 100, NONCE),
    );
  });

  it("changes the signature when the body, method, path, time or nonce changes", () => {
    const sign = (request = REQUEST, at = 100, nonce = NONCE) =>
      signRequest(SECRET, request, at, nonce)["x-pp-signature"];
    const base = sign();
    expect(sign({ ...REQUEST, body: "{}" })).not.toBe(base);
    expect(sign({ ...REQUEST, method: "GET" })).not.toBe(base);
    expect(sign({ ...REQUEST, path: "/v1/score" })).not.toBe(base);
    expect(sign(REQUEST, 101)).not.toBe(base);
    expect(sign(REQUEST, 100, "f".repeat(32))).not.toBe(base);
  });

  it("truncates fractional seconds", () => {
    expect(signRequest(SECRET, REQUEST, 12.9)["x-pp-timestamp"]).toBe("12");
  });
});
