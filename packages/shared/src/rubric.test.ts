import { describe, expect, it } from "vitest";
import { RUBRIC_DIMENSIONS, RUBRIC_KEYS, ScorecardSchema, computeOverall } from "./rubric.js";
import type { RubricKey } from "./rubric.js";

type Score = 1 | 2 | 3 | 4 | 5;

const dims = (score: Score, overrides: Partial<Record<RubricKey, Score>> = {}) =>
  RUBRIC_KEYS.map((key) => ({ key, score: overrides[key] ?? score }));

interface TestDimension {
  key: RubricKey;
  score: number;
  justification: string;
  evidence: string | null;
}

const validScorecard = () => ({
  overall: 63,
  dimensions: RUBRIC_KEYS.map((key): TestDimension => ({
    key,
    score: 3,
    justification: "Clear enough, but the point arrived late.",
    evidence: null,
  })),
  strengths: ["Warm opening", "Used a concrete example", "Stayed on topic"],
  improvements: ["Ask about budget", "Name a next step", "Cut the filler words"],
  strongerLine: {
    original: "I think maybe we could talk",
    improved: "Can we meet Thursday at 10?",
  },
});

const patchFirst = (patch: Partial<TestDimension>) => {
  const card = validScorecard();
  return { ...card, dimensions: card.dimensions.map((d, i) => (i === 0 ? { ...d, ...patch } : d)) };
};

describe("RUBRIC_DIMENSIONS", () => {
  it("lists the seven keys in order", () => {
    expect(RUBRIC_DIMENSIONS.map((d) => d.key)).toEqual([
      "clarity",
      "value",
      "structure",
      "discovery",
      "objections",
      "confidence",
      "cta",
    ]);
    for (const d of RUBRIC_DIMENSIONS) {
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.low.length).toBeGreaterThan(0);
      expect(d.high.length).toBeGreaterThan(0);
    }
  });
});

describe("computeOverall", () => {
  it("maps all fives to 100", () => {
    expect(computeOverall(dims(5), "clarity")).toBe(100);
  });

  it("maps all ones to 0", () => {
    expect(computeOverall(dims(1), "cta")).toBe(0);
  });

  it("double-weights the skill's dimension and rounds half up", () => {
    expect(computeOverall(dims(3, { clarity: 5 }), "clarity")).toBe(63);
  });

  it("does not weight a dimension that is not the skill's", () => {
    // mean (3*7 + 5*1) / 8 = 3.25 -> 56.25 -> 56
    expect(computeOverall(dims(3, { clarity: 5 }), "cta")).toBe(56);
  });

  it("rejects an empty dimension list", () => {
    expect(() => computeOverall([], "clarity")).toThrow();
  });
});

describe("ScorecardSchema", () => {
  it("accepts a valid scorecard", () => {
    expect(ScorecardSchema.safeParse(validScorecard()).success).toBe(true);
  });

  it("rejects six dimensions", () => {
    const card = validScorecard();
    card.dimensions.pop();
    expect(ScorecardSchema.safeParse(card).success).toBe(false);
  });

  it("rejects duplicate keys", () => {
    const card = validScorecard();
    const dimensions = card.dimensions.map((d, i) =>
      i === 6 ? { ...d, key: "clarity" as const } : d,
    );
    expect(ScorecardSchema.safeParse({ ...card, dimensions }).success).toBe(false);
  });

  it("rejects two strengths", () => {
    const card = validScorecard();
    card.strengths.pop();
    expect(ScorecardSchema.safeParse(card).success).toBe(false);
  });

  it("rejects a score of 6 or 0", () => {
    expect(ScorecardSchema.safeParse(patchFirst({ score: 6 })).success).toBe(false);
    expect(ScorecardSchema.safeParse(patchFirst({ score: 0 })).success).toBe(false);
    expect(ScorecardSchema.safeParse(patchFirst({ score: 2.5 })).success).toBe(false);
  });

  it("rejects a non-integer or out-of-range overall", () => {
    expect(ScorecardSchema.safeParse({ ...validScorecard(), overall: 62.5 }).success).toBe(false);
    expect(ScorecardSchema.safeParse({ ...validScorecard(), overall: 101 }).success).toBe(false);
    expect(ScorecardSchema.safeParse({ ...validScorecard(), overall: -1 }).success).toBe(false);
  });

  it("enforces text length limits and unknown keys", () => {
    expect(ScorecardSchema.safeParse(patchFirst({ justification: "x".repeat(240) })).success).toBe(
      true,
    );
    expect(ScorecardSchema.safeParse(patchFirst({ justification: "x".repeat(241) })).success).toBe(
      false,
    );
    expect(ScorecardSchema.safeParse(patchFirst({ evidence: "x".repeat(160) })).success).toBe(true);
    expect(ScorecardSchema.safeParse(patchFirst({ evidence: "x".repeat(161) })).success).toBe(
      false,
    );
    expect(ScorecardSchema.safeParse({ ...validScorecard(), extra: 1 }).success).toBe(false);
    const long = { ...validScorecard(), strengths: ["a", "b", "c".repeat(161)] };
    expect(ScorecardSchema.safeParse(long).success).toBe(false);
  });
});
