import { describe, expect, it } from "vitest";
import { CANARY, containsCanary } from "./canary.js";

describe("canary", () => {
  it("is a per-process random token", () => {
    expect(CANARY).toMatch(/^pp-canary-[0-9a-f-]{36}$/);
  });

  it("detects the full canary inside text", () => {
    expect(containsCanary(`Sure, it is ${CANARY}. Anything else?`)).toBe(true);
  });

  it("detects the id alone and in other case", () => {
    const id = CANARY.slice("pp-canary-".length);
    expect(containsCanary(`the code was ${id}`)).toBe(true);
    expect(containsCanary(CANARY.toUpperCase())).toBe(true);
  });

  it("detects the id when the model drops the hyphens", () => {
    const id = CANARY.slice("pp-canary-".length).replaceAll("-", "");
    expect(containsCanary(`code ${id}`)).toBe(true);
  });

  it("does not flag ordinary text", () => {
    expect(containsCanary("We can talk about pricing on Thursday.")).toBe(false);
    expect(containsCanary("pp-canary- is not it")).toBe(false);
  });
});
