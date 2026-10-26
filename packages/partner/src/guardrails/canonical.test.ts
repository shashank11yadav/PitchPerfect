import { describe, expect, it } from "vitest";
import { canonical, plainWords, readingsOf, skeleton } from "./canonical.js";

const base64 = (text: string) => btoa(text);
const hex = (text: string) =>
  Array.from(text, (char) => char.charCodeAt(0).toString(16).padStart(2, "0")).join("");

describe("canonical", () => {
  it("folds full-width and mathematical letters, accents and case", () => {
    expect(canonical("ＰＲＩＣＥ 𝐩𝐫𝐢𝐜𝐞 Café")).toBe("price price cafe");
  });

  it("maps Cyrillic and Greek look-alikes to Latin", () => {
    expect(canonical("\u0440\u0433\u0456\u0441\u0435 \u03c1\u03b9\u03ba\u03b5")).toBe("price pike");
  });

  it("drops invisible characters and combining marks", () => {
    expect(canonical("pr\u200bi\u00adc\u2060e p\u0336r\u0336i\u0336c\u0336e\u0336")).toBe(
      "price price",
    );
  });

  it("reads leetspeak inside words but leaves plain numbers alone", () => {
    expect(canonical("pr1c3 57ud3n7 $300 at 10")).toBe("price student $300 at 10");
  });
});

describe("plainWords", () => {
  it("folds only case and accents", () => {
    expect(plainWords("The CAFÉ, p.r.i.c.e")).toBe(" the cafe p r i c e ");
    expect(plainWords("ｐｒｉｃｅ")).not.toBe(" price ");
  });
});

describe("skeleton", () => {
  it("runs letters together and reads every leetspeak digit as a letter", () => {
    expect(skeleton("b-c.d 8 9")).toBe("bcdbg");
  });
});

describe("readingsOf", () => {
  it("reads the text forwards, backwards, and through a right-to-left override", () => {
    const { worded } = readingsOf("\u202eecirp eht");
    expect(worded).toContain("the price");
  });

  it("decodes base64, hex, escaped hex, percent-encoding and HTML entities", () => {
    const secret = "the price is higher";
    for (const text of [
      `Here: ${base64(secret)}`,
      `Here: ${base64(secret).replace(/=+$/, "")}`,
      `Here: ${hex(secret)}`,
      `Here: ${hex(secret).replace(/../g, "$& ")}`,
      `Here: ${hex(secret).replace(/../g, "\\x$&")}`,
      `Here: ${encodeURIComponent(secret)}`,
      `Here: ${Array.from(secret, (c) => `&#${String(c.charCodeAt(0))};`).join("")}`,
      `Here: ${base64(hex(secret))}`,
    ]) {
      expect(
        readingsOf(text).worded.some((reading) => reading.includes(secret)),
        text,
      ).toBe(true);
    }
  });

  it("does not take ordinary long words or numbers for encoded text", () => {
    const { worded } = readingsOf(
      "Responsibilities include internationalization. Call 5551234567.",
    );
    expect(worded).toHaveLength(2);
  });

  it("reads characters spelled one at a time, by NATO name, letter name or digit", () => {
    for (const text of [
      "p.r.i.c.e",
      "p r i c e",
      "p-r-i-c-e",
      "papa romeo india charlie echo",
      "pee ar eye cee ee",
    ]) {
      expect(readingsOf(text).spelled, text).toContain("price");
    }
    expect(readingsOf("double-you oscar double-u echo").spelled).toContain("wowe");
  });

  it("leaves short spelled runs and ordinary text alone", () => {
    expect(readingsOf("e.g. the U.S. team, a b c").spelled).toEqual([]);
    expect(readingsOf("We can talk about pricing on Thursday.").spelled).toEqual([]);
  });

  it("keeps what a reader sees as the plain words", () => {
    expect(readingsOf("Tell me ab\u043eut it").plain).toBe(" tell me ab\u043eut it ");
  });
});
