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

/** Long, winding turns with one sentence past the evidence limit. */
const RAMBLING = [
  "Hi, I'm Riley, and I wanted to reach out because we have been working with a lot of different logistics companies across the region on all kinds of planning problems and reporting problems and some driver communication problems too, and it has been going really well for most of them so far this year.",
  "So what we do is we take the spreadsheets and the phone calls and the whiteboards that most dispatch teams use and we put all of it into one place where everybody can see it at the same time without having to ask around.",
  "What does a normal morning look like for your dispatchers right now when someone calls in sick?",
];

/** Turns of a word or two. */
const TERSE = ["Hi.", "Okay.", "Sure.", "Thanks."];

/** Few sentences, no hedges: every quote has to be shared out carefully. */
const SPARE = [
  "Hi, I'm Riley from Routewise.",
  "How do you plan routes today?",
  "Our planner saves your team hours.",
  "We work with dispatch teams in Ohio.",
];

/** A friendly call that never says what changes for the buyer. */
const NO_BENEFIT = [
  "Hi Sam, thanks for taking the call. I work with clinic groups whose front desks spend hours a week on appointment reminders. How do your clinics handle reminders today?",
  "That makes sense. If the reminders ran on their own and no-shows dropped, who on your side would want to see that first?",
  "Fair question on price. What does one empty chair cost a clinic for an afternoon? Could we go through your numbers together on Thursday at 2pm?",
];

/** Friendly and full of questions, but it never asks for anything. */
const NO_ASK = [
  "Hi Sam, thanks for taking the call. How do your clinics handle reminders today?",
  "That makes sense. Who on your side looks after the front desk?",
  "Got it. What does a no-show cost you?",
];

/** Says the price worry is fair, then never answers it: the 20 minutes in the ask isn't proof. */
const UNANSWERED = [
  "Hi Maya, I'm Riley from Routewise. Thanks for picking up. How do your dispatchers plan routes today?",
  "How much time does that take each morning?",
  "We help dispatch teams cut replanning time. Our planner rebuilds routes in minutes when a driver calls in sick.",
  "That's fair. What do you pay today, roughly?",
  "Could we set up 20 minutes on Thursday at 10am with you and your dispatch lead?",
  "Who else would need to sign off?",
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

  it("marks a rambling call down and quotes its longest sentence, cut at a word", () => {
    const clarity = card(RAMBLING).dimensions.find((dimension) => dimension.key === "clarity");
    expect(clarity?.score).toBeLessThanOrEqual(3);
    const evidence = clarity?.evidence ?? "";
    const source = RAMBLING[0] ?? "";
    expect(source.startsWith(evidence)).toBe(true);
    // The quote stops between words, not partway through one.
    expect([" ", ",", undefined]).toContain(source[evidence.length]);
  });

  it("doesn't praise one-word turns as short and clear", () => {
    const terse = card(TERSE);
    expect(terse.strengths.join(" ")).not.toMatch(/about 1 word/);
    const clarity = terse.dimensions.find((dimension) => dimension.key === "clarity");
    expect(clarity?.score).toBeLessThanOrEqual(2);
  });

  it("gives confidence a quote before clarity when quotes run short", () => {
    const confidence = card(SPARE).dimensions.find((dimension) => dimension.key === "confidence");
    expect(confidence?.evidence).not.toBeNull();
  });

  it("aims the stronger line at the weakest score even when it has no quote", () => {
    const scorecard = card(NO_BENEFIT);
    const value = scorecard.dimensions.find((dimension) => dimension.key === "value");
    expect(value?.evidence).toBeNull();
    expect(Math.min(...scorecard.dimensions.map((dimension) => dimension.score))).toBe(
      value?.score,
    );
    expect(scorecard.strongerLine.improved).toMatch(/worth to your team/);
    expect(NO_BENEFIT.some((turn) => turn.includes(scorecard.strongerLine.original))).toBe(true);
  });

  it("doesn't take thanks for the call as an ask for a meeting", () => {
    const cta = card(NO_ASK).dimensions.find((dimension) => dimension.key === "cta");
    expect(cta?.score).toBe(1);
    expect(cta?.evidence).toBeNull();
  });

  it("quotes the call's last line when the call ended without an ask", () => {
    const structure = card(NO_ASK).dimensions.find((dimension) => dimension.key === "structure");
    expect(structure?.justification).toMatch(/without an ask/);
    expect(structure?.evidence).toBe("What does a no-show cost you?");
  });

  it("counts proof only when it answers an acknowledged concern, not a time in the ask", () => {
    const unanswered = card(UNANSWERED);
    const objections = unanswered.dimensions.find((dimension) => dimension.key === "objections");
    expect(objections?.score).toBeLessThanOrEqual(3);
    const strong = card(STRONG).dimensions.find((dimension) => dimension.key === "objections");
    expect(strong?.score).toBeGreaterThanOrEqual(4);
  });

  it("doesn't take 'can I get that over to you' as acknowledging pushback", () => {
    const turns = [
      "Hi, I'm Riley from Routewise. How do you plan routes today?",
      "Our planner rebuilds routes in minutes, so your dispatchers stop redoing them.",
      "Can I get that over to you by Friday? I want to understand how your week looks.",
    ];
    const objections = card(turns).dimensions.find((dimension) => dimension.key === "objections");
    expect(objections?.score).toBe(1);
    expect(objections?.justification).toMatch(/No line shows you acknowledging/);
    const owned = card([
      ...turns.slice(0, 2),
      "I get that, and one carrier your size cut overtime by $3,000.",
    ]);
    expect(
      owned.dimensions.find((dimension) => dimension.key === "objections")?.score,
    ).toBeGreaterThanOrEqual(3);
  });

  it("doesn't take wanting to understand their process as acknowledging pushback", () => {
    const turns = [
      "Hi, I'm Riley from Routewise. How do you plan routes today?",
      "Our planner rebuilds routes in minutes, so your dispatchers stop redoing them.",
      "I want to understand your process a bit better.",
    ];
    const objections = card(turns).dimensions.find((dimension) => dimension.key === "objections");
    expect(objections?.score).toBe(1);
    expect(objections?.justification).toMatch(/No line shows you acknowledging/);
  });

  it.each([
    "I understand.",
    "Totally understand.",
    "Understand.",
    "Understand completely.",
    "Understand, mid-quarter is tough.",
    "Completely understand where you're coming from.",
    "That's fair.",
    "Makes sense.",
    "I hear you.",
  ])("scores %j as acknowledging the pushback, the same as 'I understand'", (acknowledgement) => {
    const call = (ack: string) => [
      "Hi Maya, I'm Alex from Routekeep.",
      "How do you plan routes today?",
      "Routekeep rebuilds routes in two minutes, which saves your dispatchers hours.",
      `${ack} One carrier your size cut replanning by 4 hours a week.`,
      "Could we do Thursday at 2?",
    ];
    const score = (ack: string) =>
      heuristicScorecard(call(ack), "objections").dimensions.find((d) => d.key === "objections")
        ?.score;
    expect(score(acknowledgement)).toBe(score("I understand."));
    expect(score(acknowledgement)).toBeGreaterThanOrEqual(4);
  });

  it("credits proof in the same sentence as the acknowledgement", () => {
    const turns = [
      "Hi, I'm Riley from Routewise. How do you plan routes today?",
      "Our planner rebuilds routes in minutes, so your dispatchers stop redoing them.",
      "I hear you on price, and one carrier your size cut overtime by $3,000 a month.",
    ];
    const objections = card(turns).dimensions.find((dimension) => dimension.key === "objections");
    expect(objections?.justification).toMatch(/backed it up with something concrete/);
  });
});
