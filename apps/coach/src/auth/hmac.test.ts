import { signRequest } from "@pitchperfect/shared/hmac";
import { describe, expect, it } from "vitest";
import { SIGNATURE_WINDOW_SEC, verifySignature } from "./hmac.js";

const SECRET = "test-only-secret-for-signing-0000000000000";
const NOW = 1_700_000_000;
const BODY = '{"skill":"pitching"}';
const REQ = { method: "POST", path: "/v1/plan", body: BODY };

describe("verifySignature", () => {
  it("accepts a valid signature", () => {
    expect(verifySignature(SECRET, signRequest(SECRET, REQ, NOW), REQ, NOW)).toBeDefined();
  });

  it("accepts an empty body", () => {
    expect(
      verifySignature(
        SECRET,
        signRequest(SECRET, { ...REQ, body: "" }, NOW),
        { ...REQ, body: "" },
        NOW,
      ),
    ).toBeDefined();
  });

  it("rejects a changed body", () => {
    const headers = signRequest(SECRET, REQ, NOW);
    expect(verifySignature(SECRET, headers, { ...REQ, body: `${BODY} ` }, NOW)).toBeUndefined();
  });

  it("rejects a signature made for another path or method", () => {
    const headers = signRequest(SECRET, REQ, NOW);
    expect(verifySignature(SECRET, headers, { ...REQ, path: "/v1/score" }, NOW)).toBeUndefined();
    expect(verifySignature(SECRET, headers, { ...REQ, method: "GET" }, NOW)).toBeUndefined();
    expect(verifySignature(SECRET, headers, { ...REQ, method: "post" }, NOW)).toBeDefined();
  });

  it("rejects a different secret", () => {
    const headers = signRequest("another-secret-another-secret-0000000", REQ, NOW);
    expect(verifySignature(SECRET, headers, REQ, NOW)).toBeUndefined();
  });

  it("rejects a timestamp that is 61 s old or 61 s in the future", () => {
    expect(verifySignature(SECRET, signRequest(SECRET, REQ, NOW - 61), REQ, NOW)).toBeUndefined();
    expect(verifySignature(SECRET, signRequest(SECRET, REQ, NOW + 61), REQ, NOW)).toBeUndefined();
  });

  it("accepts a timestamp exactly on the window edge", () => {
    expect(SIGNATURE_WINDOW_SEC).toBe(60);
    expect(verifySignature(SECRET, signRequest(SECRET, REQ, NOW - 60), REQ, NOW)).toBeDefined();
    expect(verifySignature(SECRET, signRequest(SECRET, REQ, NOW + 60), REQ, NOW)).toBeDefined();
  });

  it("rejects a signature with the wrong length without throwing", () => {
    const headers = signRequest(SECRET, REQ, NOW);
    for (const bad of [
      headers["x-pp-signature"].slice(0, -2),
      `${headers["x-pp-signature"]}00`,
      "",
      "abc",
    ]) {
      expect(
        verifySignature(SECRET, { ...headers, "x-pp-signature": bad }, REQ, NOW),
      ).toBeUndefined();
    }
  });

  it("rejects non-hex and odd-length signatures without throwing", () => {
    const headers = signRequest(SECRET, REQ, NOW);
    const valid = headers["x-pp-signature"];
    for (const bad of [
      "z".repeat(64),
      valid.slice(0, -1),
      `${valid.slice(0, 63)}g`,
      "é".repeat(32),
    ]) {
      expect(
        verifySignature(SECRET, { ...headers, "x-pp-signature": bad }, REQ, NOW),
      ).toBeUndefined();
    }
  });

  it("rejects missing, repeated, or malformed headers", () => {
    const headers = signRequest(SECRET, REQ, NOW);
    expect(verifySignature(SECRET, {}, REQ, NOW)).toBeUndefined();
    expect(
      verifySignature(SECRET, { "x-pp-timestamp": headers["x-pp-timestamp"] }, REQ, NOW),
    ).toBeUndefined();
    expect(
      verifySignature(SECRET, { "x-pp-signature": headers["x-pp-signature"] }, REQ, NOW),
    ).toBeUndefined();
    expect(
      verifySignature(
        SECRET,
        { ...headers, "x-pp-signature": [headers["x-pp-signature"], headers["x-pp-signature"]] },
        REQ,
        NOW,
      ),
    ).toBeUndefined();
    for (const timestamp of ["abc", "", "1e9", "-5", "1700000000.5", " 1700000000"]) {
      expect(
        verifySignature(SECRET, { ...headers, "x-pp-timestamp": timestamp }, REQ, NOW),
      ).toBeUndefined();
    }
  });

  it("returns the nonce and when the request leaves the window", () => {
    const headers = signRequest(SECRET, REQ, NOW - 10);
    expect(verifySignature(SECRET, headers, REQ, NOW)).toEqual({
      nonce: headers["x-pp-nonce"],
      expiresSec: NOW - 10 + SIGNATURE_WINDOW_SEC,
    });
  });

  it("rejects a missing, malformed or swapped nonce", () => {
    const headers = signRequest(SECRET, REQ, NOW);
    const { "x-pp-nonce": nonce, ...withoutNonce } = headers;
    expect(verifySignature(SECRET, withoutNonce, REQ, NOW)).toBeUndefined();
    for (const bad of [
      "",
      "abc",
      nonce.toUpperCase(),
      `${nonce}00`,
      "g".repeat(32),
      "f".repeat(32),
    ]) {
      expect(
        verifySignature(SECRET, { ...headers, "x-pp-nonce": bad }, REQ, NOW),
        bad,
      ).toBeUndefined();
    }
  });
});
