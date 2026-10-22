import { describe, expect, it } from "vitest";
import { countChars, normalizeTurnText, slugify } from "./text.js";

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

describe("slugify", () => {
  it("lowercases, strips accents and punctuation, and appends the suffix", () => {
    expect(slugify("Senior SDR — Boston!", "a1b2c3")).toBe("senior-sdr-boston-a1b2c3");
    expect(slugify("  Café   Manager__(Remote) ", "zzzzzz")).toBe("cafe-manager-remote-zzzzzz");
  });

  it("keeps the base to 60 characters and falls back to the suffix alone", () => {
    expect(slugify("x".repeat(80), "s1")).toBe(`${"x".repeat(60)}-s1`);
    expect(slugify("!!!", "only")).toBe("only");
  });
});
