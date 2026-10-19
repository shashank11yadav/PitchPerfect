import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signRequest } from "./hmac.js";

const SECRET = "test-only-secret-for-signing-0000000000000";

describe("signRequest", () => {
  it("signs `${timestamp}.${body}` with HMAC-SHA256 and returns hex", () => {
    const headers = signRequest(SECRET, '{"a":1}', 1_700_000_000);
    const expected = createHmac("sha256", SECRET).update('1700000000.{"a":1}').digest("hex");
    expect(headers).toEqual({ "x-pp-timestamp": "1700000000", "x-pp-signature": expected });
  });

  it("changes the signature when the body or the time changes", () => {
    const base = signRequest(SECRET, "{}", 100)["x-pp-signature"];
    expect(signRequest(SECRET, '{"x":1}', 100)["x-pp-signature"]).not.toBe(base);
    expect(signRequest(SECRET, "{}", 101)["x-pp-signature"]).not.toBe(base);
  });

  it("truncates fractional seconds", () => {
    expect(signRequest(SECRET, "", 12.9)["x-pp-timestamp"]).toBe("12");
  });
});
