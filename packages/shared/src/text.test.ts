import { describe, expect, it } from "vitest";
import { countChars, normalizeTurnText } from "./text.js";

describe("normalizeTurnText", () => {
  it("strips control characters, collapses spaces, and trims", () => {
    expect(normalizeTurnText("a\u0000b\t\tc  \n d ")).toBe("ab c \n d");
  });

  it("normalizes Windows line endings and keeps newlines", () => {
    expect(normalizeTurnText("one\r\ntwo")).toBe("one\ntwo");
  });

  it("keeps emoji and accents", () => {
    expect(normalizeTurnText("  café 😀  ")).toBe("café 😀");
  });

  it("returns an empty string for whitespace and control characters only", () => {
    expect(normalizeTurnText(" \t\u0007 \n ")).toBe("");
  });
});

describe("countChars", () => {
  it("counts code points, not UTF-16 units", () => {
    expect(countChars("😀".repeat(1000))).toBe(1000);
    expect(countChars("café")).toBe(4);
  });
});
