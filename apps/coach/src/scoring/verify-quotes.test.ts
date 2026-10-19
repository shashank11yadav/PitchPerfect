import { RUBRIC_KEYS, type Scorecard } from "@pitchperfect/shared";
import { describe, expect, it } from "vitest";
import { studentSentences, verifyQuotes } from "./verify-quotes.js";

const TURNS = [
  "Hi Sam, I'm Lee.   I help clinics fill empty appointment slots.",
  "What happens today when a patient cancels late?\nHow much does that cost you per month?",
];

function scorecard(evidence: (string | null)[], original: string): Scorecard {
  return {
    overall: 50,
    dimensions: RUBRIC_KEYS.map((key, index) => ({
      key,
      score: 3,
      justification: "Reasonable.",
      evidence: evidence[index] ?? null,
    })),
    strengths: ["a", "b", "c"],
    improvements: ["d", "e", "f"],
    strongerLine: { original, improved: "A better line." },
  };
}

describe("verifyQuotes", () => {
  it("keeps exact quotes and quotes that differ only in whitespace", () => {
    const card = verifyQuotes(
      scorecard(
        [
          "I help clinics fill empty appointment slots.",
          "Hi Sam, I'm Lee. I help",
          "cancels late? How much",
        ],
        "What happens today when a patient cancels late?",
      ),
      TURNS,
    );
    expect(card.dimensions[0]?.evidence).toBe("I help clinics fill empty appointment slots.");
    expect(card.dimensions[1]?.evidence).toBe("Hi Sam, I'm Lee. I help");
    expect(card.dimensions[2]?.evidence).toBe("cancels late? How much");
    expect(card.strongerLine.original).toBe("What happens today when a patient cancels late?");
  });

  it("drops fabricated or paraphrased evidence", () => {
    const card = verifyQuotes(
      scorecard(
        ["We guarantee a 50% revenue lift.", "i help clinics fill empty appointment slots.", "  "],
        "What happens today when a patient cancels late?",
      ),
      TURNS,
    );
    expect(card.dimensions.slice(0, 3).map((d) => d.evidence)).toEqual([null, null, null]);
  });

  it("reads escaped angle brackets in a quote as the characters the student typed", () => {
    const card = verifyQuotes(scorecard(["costs &lt; 5 minutes"], "x"), ["It costs < 5 minutes."]);
    expect(card.dimensions[0]?.evidence).toBe("costs < 5 minutes");
  });

  it("replaces a fabricated strongerLine original with the longest student sentence", () => {
    const card = verifyQuotes(scorecard([], "Something the student never said."), TURNS);
    expect(card.strongerLine.original).toBe("What happens today when a patient cancels late?");
    expect(card.strongerLine.improved).toBe("A better line.");
  });

  it("does not quote other turns, only the student turns it was given", () => {
    const card = verifyQuotes(scorecard(["Go on, I'm listening."], "x"), TURNS);
    expect(card.dimensions[0]?.evidence).toBeNull();
  });

  it("refuses to run without any student sentence", () => {
    expect(() => verifyQuotes(scorecard([], "x"), ["   "])).toThrow();
  });
});

describe("studentSentences", () => {
  it("splits turns into whitespace-normalized sentences", () => {
    expect(studentSentences(TURNS)).toEqual([
      "Hi Sam, I'm Lee.",
      "I help clinics fill empty appointment slots.",
      "What happens today when a patient cancels late?",
      "How much does that cost you per month?",
    ]);
    expect(studentSentences([" ", ""])).toEqual([]);
  });
});
