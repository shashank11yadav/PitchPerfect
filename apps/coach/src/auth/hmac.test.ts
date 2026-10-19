import { signRequest } from "@pitchperfect/shared/hmac";
import { describe, expect, it } from "vitest";
import { SIGNATURE_WINDOW_SEC, verifySignature } from "./hmac.js";

const SECRET = "test-only-secret-for-signing-0000000000000";
const NOW = 1_700_000_000;
const BODY = '{"skill":"pitching"}';

describe("verifySignature", () => {
  it("accepts a valid signature", () => {
    expect(verifySignature(SECRET, signRequest(SECRET, BODY, NOW), BODY, NOW)).toBe(true);
  });

  it("accepts an empty body", () => {
    expect(verifySignature(SECRET, signRequest(SECRET, "", NOW), "", NOW)).toBe(true);
  });

  it("rejects a changed body", () => {
    const headers = signRequest(SECRET, BODY, NOW);
    expect(verifySignature(SECRET, headers, `${BODY} `, NOW)).toBe(false);
  });

  it("rejects a different secret", () => {
    const headers = signRequest("another-secret-another-secret-0000000", BODY, NOW);
    expect(verifySignature(SECRET, headers, BODY, NOW)).toBe(false);
  });

  it("rejects a timestamp that is 61 s old or 61 s in the future", () => {
    expect(verifySignature(SECRET, signRequest(SECRET, BODY, NOW - 61), BODY, NOW)).toBe(false);
    expect(verifySignature(SECRET, signRequest(SECRET, BODY, NOW + 61), BODY, NOW)).toBe(false);
  });

  it("accepts a timestamp exactly on the window edge", () => {
    expect(SIGNATURE_WINDOW_SEC).toBe(60);
    expect(verifySignature(SECRET, signRequest(SECRET, BODY, NOW - 60), BODY, NOW)).toBe(true);
    expect(verifySignature(SECRET, signRequest(SECRET, BODY, NOW + 60), BODY, NOW)).toBe(true);
  });

  it("rejects a signature with the wrong length without throwing", () => {
    const headers = signRequest(SECRET, BODY, NOW);
    for (const bad of [
      headers["x-pp-signature"].slice(0, -2),
      `${headers["x-pp-signature"]}00`,
      "",
      "abc",
    ]) {
      expect(verifySignature(SECRET, { ...headers, "x-pp-signature": bad }, BODY, NOW)).toBe(false);
    }
  });

  it("rejects non-hex and odd-length signatures without throwing", () => {
    const headers = signRequest(SECRET, BODY, NOW);
    const valid = headers["x-pp-signature"];
    for (const bad of [
      "z".repeat(64),
      valid.slice(0, -1),
      `${valid.slice(0, 63)}g`,
      "é".repeat(32),
    ]) {
      expect(verifySignature(SECRET, { ...headers, "x-pp-signature": bad }, BODY, NOW)).toBe(false);
    }
  });

  it("rejects missing, repeated, or malformed headers", () => {
    const headers = signRequest(SECRET, BODY, NOW);
    expect(verifySignature(SECRET, {}, BODY, NOW)).toBe(false);
    expect(
      verifySignature(SECRET, { "x-pp-timestamp": headers["x-pp-timestamp"] }, BODY, NOW),
    ).toBe(false);
    expect(
      verifySignature(SECRET, { "x-pp-signature": headers["x-pp-signature"] }, BODY, NOW),
    ).toBe(false);
    expect(
      verifySignature(
        SECRET,
        { ...headers, "x-pp-signature": [headers["x-pp-signature"], headers["x-pp-signature"]] },
        BODY,
        NOW,
      ),
    ).toBe(false);
    for (const timestamp of ["abc", "", "1e9", "-5", "1700000000.5", " 1700000000"]) {
      expect(verifySignature(SECRET, { ...headers, "x-pp-timestamp": timestamp }, BODY, NOW)).toBe(
        false,
      );
    }
  });
});
