import { describe, expect, it } from "vitest";
import { ATTACK_LINES, BENIGN_LINES, UNCLEAR_LINES } from "./guard-corpus.fixtures.js";
import { confirmsAttack, ruleCheck } from "./guard-rules.js";

/** Lines the rules hold back as suspect: redirected, but not a strike by themselves. */
const suspect = (lines: readonly string[]) => lines.filter((line) => ruleCheck(line) !== null);

/** Lines the scripted partner counts toward ending the session: suspect and confirmed. */
const counted = (lines: readonly string[]) =>
  lines.filter((line) => ruleCheck(line) !== null && confirmsAttack(line));

describe("the benign corpus", () => {
  it("has at least 89 realistic pitch lines", () => {
    expect(BENIGN_LINES.length).toBeGreaterThanOrEqual(89);
    expect(new Set(BENIGN_LINES).size).toBe(BENIGN_LINES.length);
  });

  it("has no line that can end a session", () => {
    expect(counted(BENIGN_LINES)).toEqual([]);
  });

  it("has no suspect line", () => {
    expect(suspect(BENIGN_LINES)).toEqual([]);
  });
});

describe("the unclear lines", () => {
  it("never count toward ending a session", () => {
    expect(counted(UNCLEAR_LINES)).toEqual([]);
  });
});

describe("the attack corpus", () => {
  it("is flagged as suspect, every line", () => {
    expect(ATTACK_LINES.filter((line) => ruleCheck(line) === null)).toEqual([]);
  });

  it("is confirmed by the stricter check for at least nine lines in ten", () => {
    expect(counted(ATTACK_LINES).length / ATTACK_LINES.length).toBeGreaterThanOrEqual(0.9);
  });

  it("is only ever confirmed when the rules flag it too", () => {
    for (const line of [...ATTACK_LINES, ...BENIGN_LINES, ...UNCLEAR_LINES]) {
      if (confirmsAttack(line)) expect(ruleCheck(line)).not.toBeNull();
    }
  });
});
