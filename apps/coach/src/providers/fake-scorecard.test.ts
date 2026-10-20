import { RUBRIC_DIMENSIONS, ScorecardSchema, type Scorecard } from "@pitchperfect/shared";
import { describe, expect, it } from "vitest";
import { heuristicScorecard, plural } from "./fake-scorecard.js";

const STRONG = [
  "Hi, I'm Riley. I help dispatch teams plan routes faster. How do you plan routes today?",
  "Our planner rebuilds the day's routes in minutes when a driver calls out, so your team stops firefighting.",
  "That's fair, and I'd want proof too. Teams like yours cut 4 hours a week of replanning.",
  "Could we set up a 20 minute demo next Tuesday at 10am with you and your dispatch lead?",
];

const HEDGY = [
  "Um, hi, sorry, I just think maybe our software could kind of help you.",
  "It basically does routing and reporting and a lot of other things for logistics companies of all sizes and shapes across the country.",
  "Do you use spreadsheets?",
];

const card = (turns: readonly string[]) => heuristicScorecard(turns, "value");

/** Every sentence the card says about the student. */
const prose = (scorecard: Scorecard) => [
  ...scorecard.dimensions.map((dimension) => dimension.justification),
  ...scorecard.strengths,
  ...scorecard.improvements,
  scorecard.strongerLine.improved,
];

describe("plural", () => {
  it("picks the word form for the count", () => {
    expect(plural(1, "question")).toBe("1 question");
    expect(plural(3, "question")).toBe("3 questions");
    expect(plural(0, "time")).toBe("0 times");
  });
});

describe("heuristicScorecard", () => {
  it.each([
    ["strong", STRONG],
    ["hedgy", HEDGY],
  ])("is a valid scorecard for a %s call", (_name, turns) => {
    expect(ScorecardSchema.safeParse(card(turns)).success).toBe(true);
  });

  it("reads like a coach: no (s), no rubric labels pasted in, no invented buyer quotes", () => {
    for (const turns of [STRONG, HEDGY]) {
      for (const line of prose(card(turns))) {
        expect(line).not.toMatch(/\(s\)/);
        expect(line).not.toMatch(/Since you said/);
        for (const { name } of RUBRIC_DIMENSIONS) expect(line.startsWith(`${name}:`)).toBe(false);
      }
    }
  });

  it("uses the student's own numbers and words in its reasons", () => {
    const hedgy = card(HEDGY);
    const reason = (key: string) =>
      hedgy.dimensions.find((dimension) => dimension.key === key)?.justification ?? "";
    expect(reason("clarity")).toMatch(/about \d+ words/);
    expect(reason("confidence")).toMatch(/You hedged \d+ times \(/);
    expect(reason("confidence")).toContain("‘just’");
    expect(reason("discovery")).toMatch(/yes or no/);
    const strong = card(STRONG);
    expect(strong.strengths.join(" ")).toContain("next Tuesday at 10am");
  });

  it("quotes a different verbatim sentence for each dimension", () => {
    for (const turns of [STRONG, HEDGY]) {
      const quotes = card(turns)
        .dimensions.map((dimension) => dimension.evidence)
        .filter((evidence): evidence is string => evidence !== null);
      expect(new Set(quotes).size).toBe(quotes.length);
      for (const evidence of quotes)
        expect(turns.some((turn) => turn.includes(evidence))).toBe(true);
    }
  });

  it("rewrites the line behind the weakest dimension", () => {
    for (const turns of [STRONG, HEDGY]) {
      const scorecard = card(turns);
      const { original, improved } = scorecard.strongerLine;
      expect(turns.some((turn) => turn.includes(original))).toBe(true);
      expect(improved).not.toBe(original);
      const lowest = Math.min(...scorecard.dimensions.map((dimension) => dimension.score));
      const quoted = scorecard.dimensions
        .filter((dimension) => dimension.score === lowest && dimension.evidence !== null)
        .map((dimension) => dimension.evidence);
      if (quoted.length > 0) expect(quoted).toContain(original);
    }
    // Hedges come out of the rewritten line.
    const hedgy = card(HEDGY).strongerLine;
    expect(hedgy.improved).not.toMatch(/\b(um|sorry|just|maybe|kind of)\b/i);
  });

  it("scores different calls differently", () => {
    expect(card(STRONG).overall).toBeGreaterThan(card(HEDGY).overall);
    const middling = card(STRONG.slice(0, 2));
    expect(new Set([card(STRONG).overall, middling.overall, card(HEDGY).overall]).size).toBe(3);
  });
});
