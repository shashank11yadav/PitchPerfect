import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SKILL_SLUGS } from "@pitchperfect/shared";
import { describe, expect, it } from "vitest";
import { EvalCaseSchema } from "./case-schema.js";
import { loadCases } from "./cases.js";

const valid = {
  id: "ok-case",
  skill: "pitching",
  kind: "strong",
  studentTurns: ["Hello."],
  expect: { overallRange: [60, 100] },
};

describe("EvalCaseSchema", () => {
  it("accepts a quality case and an adversarial case", () => {
    expect(EvalCaseSchema.safeParse(valid).success).toBe(true);
    expect(
      EvalCaseSchema.safeParse({
        ...valid,
        kind: "adversarial",
        expect: { guard: "redirect" },
      }).success,
    ).toBe(true);
  });

  it.each([
    ["an unknown field", { ...valid, extra: 1 }],
    ["an unknown skill", { ...valid, skill: "juggling" }],
    ["a reversed range", { ...valid, expect: { overallRange: [80, 20] } }],
    ["a quality case without a band", { ...valid, expect: {} }],
    ["a quality case with a guard", { ...valid, expect: { overallRange: [0, 100], guard: "ok" } }],
    ["an adversarial case without a guard", { ...valid, kind: "adversarial", expect: {} }],
    [
      "an attack turn past the end",
      { ...valid, kind: "adversarial", attackTurns: [3], expect: { guard: "redirect" } },
    ],
    [
      "ended with fewer than three attacks",
      { ...valid, kind: "adversarial", expect: { guard: "ended" } },
    ],
    ["a quality turn over the limit", { ...valid, studentTurns: ["a".repeat(1001)] }],
    [
      "a dimension out of range",
      { ...valid, expect: { overallRange: [0, 100], dimensions: { cta: [0, 5] } } },
    ],
  ])("rejects %s", (_name, input) => {
    expect(EvalCaseSchema.safeParse(input).success).toBe(false);
  });
});

describe("the shipped cases", () => {
  const cases = loadCases();
  const count = (kind: string) => cases.filter((c) => c.kind === kind).length;

  it("follow the documented mix", () => {
    expect([count("strong"), count("mediocre"), count("weak"), count("adversarial")]).toEqual([
      8, 8, 6, 8,
    ]);
  });

  it("have unique ids and cover every skill", () => {
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    const quality = cases.filter((c) => c.kind !== "adversarial");
    expect([...new Set(quality.map((c) => c.skill))].sort()).toEqual([...SKILL_SLUGS].sort());
  });

  it("include each kind of attack the design lists", () => {
    const attacks = cases.filter((c) => c.kind === "adversarial").map((c) => c.id);
    expect(attacks).toEqual([
      "adversarial-another-language",
      "adversarial-harmful-request",
      "adversarial-long-input-flood",
      "adversarial-off-topic-chatter",
      "adversarial-pii-dump",
      "adversarial-pose-as-human",
      "adversarial-prompt-extraction",
      "adversarial-role-swap",
    ]);
  });

  it("keep strong cases above weak ones", () => {
    const low = (kind: string) =>
      Math.min(...cases.filter((c) => c.kind === kind).map((c) => c.expect.overallRange?.[0] ?? 0));
    const high = (kind: string) =>
      Math.max(...cases.filter((c) => c.kind === kind).map((c) => c.expect.overallRange?.[1] ?? 0));
    expect(low("strong")).toBeGreaterThan(high("weak"));
  });

  it("reject a file that is not named after its id", () => {
    const dir = mkdtempSync(join(tmpdir(), "eval-cases-"));
    writeFileSync(join(dir, "other.json"), JSON.stringify(valid));
    expect(() => loadCases(dir)).toThrow(/named after its id/);
  });
});
