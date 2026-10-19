import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signRequest } from "./hmac.js";

const SECRET = "test-only-secret-for-signing-0000000000000";
const REQUEST = { method: "POST", path: "/v1/plan", body: '{"a":1}' };

describe("signRequest", () => {
  it("signs `${timestamp}.${METHOD}.${path}.${body}` with HMAC-SHA256 and returns hex", () => {
    const headers = signRequest(SECRET, REQUEST, 1_700_000_000);
    const expected = createHmac("sha256", SECRET)
      .update('1700000000.POST./v1/plan.{"a":1}')
      .digest("hex");
    expect(headers).toEqual({ "x-pp-timestamp": "1700000000", "x-pp-signature": expected });
  });

  it("uppercases the method", () => {
    expect(signRequest(SECRET, { ...REQUEST, method: "post" }, 100)).toEqual(
      signRequest(SECRET, REQUEST, 100),
    );
  });

  it("changes the signature when the body, method, path or time changes", () => {
    const base = signRequest(SECRET, REQUEST, 100)["x-pp-signature"];
    expect(signRequest(SECRET, { ...REQUEST, body: "{}" }, 100)["x-pp-signature"]).not.toBe(base);
    expect(signRequest(SECRET, { ...REQUEST, method: "GET" }, 100)["x-pp-signature"]).not.toBe(
      base,
    );
    expect(signRequest(SECRET, { ...REQUEST, path: "/v1/score" }, 100)["x-pp-signature"]).not.toBe(
      base,
    );
    expect(signRequest(SECRET, REQUEST, 101)["x-pp-signature"]).not.toBe(base);
  });

  it("truncates fractional seconds", () => {
    expect(signRequest(SECRET, REQUEST, 12.9)["x-pp-timestamp"]).toBe("12");
  });
});
