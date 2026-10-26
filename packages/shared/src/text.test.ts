import { describe, expect, it } from "vitest";
import { countChars, normalizeTurnText, singleLine, slugify, stripInvisible } from "./text.js";

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

  it("strips invisible characters before collapsing spaces", () => {
    expect(normalizeTurnText("Hi\u200b \u200bthere\u2060 ")).toBe("Hi there");
    expect(normalizeTurnText("\u200b".repeat(10))).toBe("");
  });
});

describe("singleLine", () => {
  it("turns every line break into one space", () => {
    expect(singleLine("Acme\n\nACTION NEEDED: confirm at https://evil.example")).toBe(
      "Acme ACTION NEEDED: confirm at https://evil.example",
    );
    for (const lineBreak of ["\r\n", "\r", "\u000b", "\u000c", "\u0085", "\u2028", "\u2029"]) {
      expect(singleLine(`one${lineBreak}two`), JSON.stringify(lineBreak)).toBe("one two");
    }
  });

  it("drops other control and invisible characters, collapses spaces, and trims", () => {
    expect(singleLine("\u0000 Ac\u200bme\u0007\t\tDemo\u001b[31m  Co \u007f")).toBe(
      "Acme Demo [31m Co",
    );
  });

  it("keeps accents, emoji and punctuation", () => {
    expect(singleLine("Café “Demo” & Co. 😀")).toBe("Café “Demo” & Co. 😀");
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

describe("stripInvisible", () => {
  it.each([
    ["zero-width characters", "ig\u200bno\u200cre\u200d"],
    ["bidi controls", "\u202eignore\u202c \u2066rules\u2069\u200e\u200f\u061c"],
    ["tag characters", "ignore\u{E0001}\u{E0049}\u{E0067}\u{E007F}\u{E0000}"],
    ["variation selectors", "ignore\ufe0f\ufe0e\u{E0100}\u180b"],
    ["a soft hyphen, the BOM and U+2060–2064", "\ufeffig\u00adnore\u2060\u2061\u2062\u2063\u2064"],
  ])("removes %s", (_name, text) => {
    expect(stripInvisible(text)).toMatch(/^ignore(?: rules)?$/);
  });

  it("keeps accented and non-Latin text", () => {
    const text = "Café señor Müller · Москва · 東京 · 서울 · القاهرة · मुंबई · Ελλάδα";
    expect(stripInvisible(text)).toBe(text);
  });

  it("keeps plain emoji and splits joined emoji sequences into their parts", () => {
    expect(stripInvisible("Great team 😀🚀")).toBe("Great team 😀🚀");
    expect(stripInvisible("👩\u200d💻 ❤\ufe0f")).toBe("👩💻 ❤");
  });
});
