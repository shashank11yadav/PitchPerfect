import { LIMITS } from "@pitchperfect/shared";
import { describe, expect, it } from "vitest";
import { InputError, sanitizeInput } from "./input.js";

describe("sanitizeInput", () => {
  it("normalizes control characters and whitespace", () => {
    expect(sanitizeInput("  hello\u0000   world \n next ")).toBe("hello world \n next");
  });

  it("accepts text at the maximum length", () => {
    const text = "a".repeat(LIMITS.turnMaxChars);
    expect(sanitizeInput(text)).toBe(text);
  });

  it("counts emoji as one character", () => {
    const text = "😀".repeat(LIMITS.turnMaxChars);
    expect(sanitizeInput(text)).toBe(text);
  });

  it("rejects text over the maximum length", () => {
    expect(() => sanitizeInput("a".repeat(LIMITS.turnMaxChars + 1))).toThrow(InputError);
  });

  it("rejects text that is empty after normalization", () => {
    expect(() => sanitizeInput(" \t\u0007 \n ")).toThrow(InputError);
    expect(() => sanitizeInput("")).toThrow(InputError);
    expect(() => sanitizeInput("\u200b".repeat(10))).toThrow(InputError);
  });

  it("strips invisible characters", () => {
    expect(sanitizeInput("Great\u200b call\u2060")).toBe("Great call");
  });

  it("does not echo the text in the error", () => {
    try {
      sanitizeInput("x".repeat(LIMITS.turnMaxChars + 1));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InputError);
      expect((error as Error).message).not.toContain("xxx");
    }
  });
});
