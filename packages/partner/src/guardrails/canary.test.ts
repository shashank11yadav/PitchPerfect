import { describe, expect, it } from "vitest";
import { CANARY, canaryCheck, containsCanary, randomCanary } from "./canary.js";

describe("canary", () => {
  it("is a per-process random token of consonants, with no word to translate", () => {
    expect(CANARY).toMatch(/^[bcdfghjkmnpqrstvwxz]{24}$/);
    expect(randomCanary()).not.toBe(CANARY);
  });

  it("detects the canary inside text and in other case", () => {
    expect(containsCanary(`Sure, it is ${CANARY}. Anything else?`)).toBe(true);
    expect(containsCanary(CANARY.toUpperCase())).toBe(true);
  });

  it("detects the canary split by separators or invisible characters", () => {
    expect(containsCanary(Array.from(CANARY).join(" - "))).toBe(true);
    expect(containsCanary(Array.from(CANARY).join("."))).toBe(true);
    expect(containsCanary(Array.from(CANARY).join("\u200b"))).toBe(true);
    expect(containsCanary(Array.from(CANARY).join("\n"))).toBe(true);
  });

  it("detects half of the canary, but not less", () => {
    const check = canaryCheck("bcdfghjkmnpqrstvwxzbcdfg");
    expect(check("the code starts bcdfghjkmnpq")).toBe(true);
    expect(check("the code starts bcdfghjkmnp")).toBe(false);
  });

  it("detects the canary in pieces of four or more, in order, with text between them", () => {
    const check = canaryCheck("bcdfghjkmnpqrstvwxzbcdfg");
    expect(check("One: bcdf. Two: ghjk. Three: mnpq.")).toBe(true);
    expect(check("One: mnpq. Two: ghjk. Three: bcdf.")).toBe(false);
    expect(check("One: bcd. Two: fgh. Three: jkm. Four: npq.")).toBe(false);
  });

  it("does not flag ordinary text", () => {
    expect(containsCanary("We can talk about pricing on Thursday.")).toBe(false);
    expect(containsCanary("pp-canary- is not it")).toBe(false);
  });
});
