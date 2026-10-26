import { describe, expect, it } from "vitest";
import {
  CoachPlanRequestSchema,
  CoachPlanResponseSchema,
  CoachScoreRequestSchema,
  CoachScoreResponseSchema,
  CoachTurnEvent,
  CoachTurnRequestSchema,
  ScenarioPrivateSchema,
  ScenarioPublicSchema,
  TranscriptEntrySchema,
  UsageSchema,
} from "./coach.js";
import { RUBRIC_KEYS } from "../rubric.js";

const usage = () => ({
  provider: "fake" as const,
  model: "test-model",
  inputTokens: 10,
  outputTokens: 5,
});
const scenarioPublic = () => ({
  personaName: "Dana Reyes",
  personaTitle: "Operations manager",
  companyType: "Regional logistics firm",
  personality: "Busy but fair",
  openingLine: "I have about five minutes. What do you have for me?",
});
const scenarioPrivate = () => ({
  hiddenObjections: ["We already have a vendor", "Budget is frozen"],
  winConditions: ["States a clear benefit", "Proposes a concrete next step"],
});
const entry = (i: number) => ({
  role: i % 2 === 0 ? ("partner" as const) : ("student" as const),
  text: `line ${String(i)}`,
});
const transcript = (n: number) => Array.from({ length: n }, (_, i) => entry(i));
const turnRequest = (n = 2) => ({
  skill: "pitching" as const,
  scenarioPublic: scenarioPublic(),
  scenarioPrivate: scenarioPrivate(),
  transcript: transcript(n),
  studentText: "Our tool cuts dispatch time by a third.",
});

describe("ScenarioPrivateSchema", () => {
  it("requires 2–3 hidden objections", () => {
    expect(ScenarioPrivateSchema.safeParse(scenarioPrivate()).success).toBe(true);
    const one = { ...scenarioPrivate(), hiddenObjections: ["only one"] };
    const four = { ...scenarioPrivate(), hiddenObjections: ["a", "b", "c", "d"] };
    const three = { ...scenarioPrivate(), hiddenObjections: ["a", "b", "c"] };
    expect(ScenarioPrivateSchema.safeParse(one).success).toBe(false);
    expect(ScenarioPrivateSchema.safeParse(four).success).toBe(false);
    expect(ScenarioPrivateSchema.safeParse(three).success).toBe(true);
  });

  it("rejects unknown keys", () => {
    expect(ScenarioPrivateSchema.safeParse({ ...scenarioPrivate(), extra: 1 }).success).toBe(false);
  });
});

describe("ScenarioPublicSchema", () => {
  it("never carries private fields", () => {
    expect(ScenarioPublicSchema.safeParse(scenarioPublic()).success).toBe(true);
    expect(
      ScenarioPublicSchema.safeParse({ ...scenarioPublic(), hiddenObjections: ["x", "y"] }).success,
    ).toBe(false);
  });
});

describe("TranscriptEntrySchema", () => {
  it("accepts student and partner entries and rejects other roles", () => {
    expect(TranscriptEntrySchema.safeParse({ role: "student", text: "hi" }).success).toBe(true);
    expect(
      TranscriptEntrySchema.safeParse({
        role: "partner",
        text: "hello",
        at: "2026-06-15T12:00:00.000Z",
        flagged: false,
      }).success,
    ).toBe(true);
    expect(TranscriptEntrySchema.safeParse({ role: "system", text: "x" }).success).toBe(false);
    expect(TranscriptEntrySchema.safeParse({ role: "student", text: "" }).success).toBe(false);
  });
});

describe("CoachTurnRequestSchema", () => {
  it("accepts up to 40 transcript entries and rejects more", () => {
    expect(CoachTurnRequestSchema.safeParse(turnRequest(40)).success).toBe(true);
    expect(CoachTurnRequestSchema.safeParse(turnRequest(41)).success).toBe(false);
  });

  it("limits the student text to 1000 characters", () => {
    expect(
      CoachTurnRequestSchema.safeParse({ ...turnRequest(), studentText: "x".repeat(1001) }).success,
    ).toBe(false);
    expect(CoachTurnRequestSchema.safeParse({ ...turnRequest(), studentText: "" }).success).toBe(
      false,
    );
  });

  it("rejects unknown keys", () => {
    expect(CoachTurnRequestSchema.safeParse({ ...turnRequest(), model: "x" }).success).toBe(false);
  });

  it("takes an optional current stage", () => {
    expect(CoachTurnRequestSchema.safeParse(turnRequest()).success).toBe(true);
    expect(
      CoachTurnRequestSchema.safeParse({ ...turnRequest(), currentStage: "objection" }).success,
    ).toBe(true);
    expect(
      CoachTurnRequestSchema.safeParse({ ...turnRequest(), currentStage: "lunch" }).success,
    ).toBe(false);
  });
});

describe("plan and score contracts", () => {
  it("CoachPlanRequestSchema takes a skill with optional context", () => {
    expect(CoachPlanRequestSchema.safeParse({ skill: "pitching" }).success).toBe(true);
    expect(
      CoachPlanRequestSchema.safeParse({
        skill: "pitching",
        targetRole: "SDR",
        industry: "Software",
        job: { title: "Intern", descriptionText: "Sell things.", skills: ["CRM"] },
      }).success,
    ).toBe(true);
    expect(
      CoachPlanRequestSchema.safeParse({ skill: "pitching", job: { title: "x" } }).success,
    ).toBe(false);
  });

  it("CoachPlanResponseSchema bundles both scenarios and usage", () => {
    expect(
      CoachPlanResponseSchema.safeParse({
        scenarioPublic: scenarioPublic(),
        scenarioPrivate: scenarioPrivate(),
        usage: usage(),
      }).success,
    ).toBe(true);
    expect(CoachPlanResponseSchema.safeParse({ scenarioPublic: scenarioPublic() }).success).toBe(
      false,
    );
  });

  it("CoachScoreRequestSchema caps the transcript", () => {
    const base = {
      skill: "pitching" as const,
      scenarioPublic: scenarioPublic(),
      scenarioPrivate: scenarioPrivate(),
    };
    expect(CoachScoreRequestSchema.safeParse({ ...base, transcript: transcript(4) }).success).toBe(
      true,
    );
    expect(CoachScoreRequestSchema.safeParse({ ...base, transcript: transcript(41) }).success).toBe(
      false,
    );
    expect(CoachScoreRequestSchema.safeParse({ ...base, transcript: [] }).success).toBe(false);
  });

  it("CoachScoreResponseSchema wraps a scorecard and usage", () => {
    const scorecard = {
      overall: 50,
      dimensions: RUBRIC_KEYS.map((key) => ({
        key,
        score: 3,
        justification: "ok",
        evidence: null,
      })),
      strengths: ["a", "b", "c"],
      improvements: ["a", "b", "c"],
      strongerLine: { original: "um", improved: "Let's meet Friday." },
    };
    expect(CoachScoreResponseSchema.safeParse({ scorecard, usage: usage() }).success).toBe(true);
    expect(CoachScoreResponseSchema.safeParse({ scorecard }).success).toBe(false);
  });

  it("UsageSchema requires non-negative integer token counts", () => {
    expect(UsageSchema.safeParse(usage()).success).toBe(true);
    expect(UsageSchema.safeParse({ ...usage(), inputTokens: -1 }).success).toBe(false);
    expect(UsageSchema.safeParse({ ...usage(), outputTokens: 1.5 }).success).toBe(false);
    expect(UsageSchema.safeParse({ ...usage(), provider: "other" }).success).toBe(false);
  });
});

describe("CoachTurnEvent", () => {
  it("accepts the four event shapes", () => {
    const events = [
      { type: "delta", text: "Hel" },
      { type: "done", stage: "pitch", finalText: "Hello.", usage: usage() },
      {
        type: "redirect",
        text: "Let's stay on the sales scenario.",
        strike: false,
        usage: usage(),
      },
      { type: "error", code: "upstream_error" },
    ];
    for (const event of events) {
      expect(CoachTurnEvent.safeParse(event).success, JSON.stringify(event)).toBe(true);
    }
  });

  it("rejects unknown types, stages, and extra keys", () => {
    expect(CoachTurnEvent.safeParse({ type: "ended", reason: "turn_limit" }).success).toBe(false);
    expect(
      CoachTurnEvent.safeParse({ type: "done", stage: "nap", finalText: "x", usage: usage() })
        .success,
    ).toBe(false);
    expect(CoachTurnEvent.safeParse({ type: "delta", text: "x", extra: 1 }).success).toBe(false);
  });

  it("needs a redirect to say whether it was a strike", () => {
    expect(CoachTurnEvent.safeParse({ type: "redirect", text: "x", usage: usage() }).success).toBe(
      false,
    );
  });
});
