import {
  CoachScoreResponseSchema,
  computeOverall,
  getSkill,
  RUBRIC_KEYS,
  type CoachScoreRequest,
  type Scorecard,
} from "@pitchperfect/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { FakeProvider, type LlmProvider } from "../src/providers/index.js";
import {
  buildApp,
  post,
  scenarioPrivate,
  scenarioPublic,
  STUDENT_LINES,
  transcriptOf,
} from "./helpers/coach.js";

let app: FastifyInstance | undefined;

function start(provider?: LlmProvider): FastifyInstance {
  app = buildApp(provider);
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const request = (overrides: Partial<CoachScoreRequest> = {}): CoachScoreRequest => ({
  skill: "objection-handling",
  scenarioPublic: scenarioPublic(),
  scenarioPrivate: scenarioPrivate(),
  transcript: transcriptOf(STUDENT_LINES),
  ...overrides,
});

const SCORES = [4, 2, 3, 5, 4, 3, 5] as const;

/** A schema-valid scorecard a model might return: a made-up overall and some made-up quotes. */
function modelScorecard(): Scorecard {
  return {
    overall: 99,
    dimensions: RUBRIC_KEYS.map((key, index) => ({
      key,
      score: SCORES[index] ?? 3,
      justification: "Specific justification.",
      evidence:
        key === "discovery"
          ? "How do you plan delivery routes today?"
          : key === "objections"
            ? "Fair point.  Teams like yours\ncut planning time by 30 percent."
            : key === "value"
              ? "We guarantee you will double revenue."
              : null,
    })),
    strengths: ["Asked an open question early.", "Acknowledged pushback.", "Proposed a time."],
    improvements: [
      "Quantify the pain.",
      "Name a reference customer.",
      "Confirm the decision maker.",
    ],
    strongerLine: { original: "I am a really great salesperson.", improved: "A sharper line." },
  };
}

describe("POST /v1/score", () => {
  it("overwrites the model's overall, drops fabricated quotes, and keeps verbatim ones", async () => {
    const provider = new FakeProvider({ overrides: { score: () => modelScorecard() } });
    const res = await post(start(provider), "/v1/score", request());
    expect(res.statusCode).toBe(200);
    const { scorecard, usage } = CoachScoreResponseSchema.parse(res.json());

    const expected = computeOverall(scorecard.dimensions, getSkill("objection-handling").weighted);
    expect(scorecard.overall).toBe(expected);
    expect(scorecard.overall).not.toBe(99);

    const evidence = Object.fromEntries(scorecard.dimensions.map((d) => [d.key, d.evidence]));
    expect(evidence.discovery).toBe("How do you plan delivery routes today?");
    expect(evidence.objections).toBe(
      "Fair point. Teams like yours cut planning time by 30 percent.",
    );
    expect(evidence.value).toBeNull();

    expect(STUDENT_LINES.some((line) => line.includes(scorecard.strongerLine.original))).toBe(true);
    expect(scorecard.strongerLine.improved).toBe("A sharper line.");
    expect(usage).toMatchObject({ provider: "fake", model: "fake" });
    expect(usage.inputTokens).toBeGreaterThan(0);
  });

  it("scores the fake provider's heuristic card end to end", async () => {
    const res = await post(start(), "/v1/score", request({ skill: "next-steps" }));
    expect(res.statusCode).toBe(200);
    const { scorecard } = CoachScoreResponseSchema.parse(res.json());
    expect(scorecard.overall).toBe(computeOverall(scorecard.dimensions, "cta"));
    for (const dimension of scorecard.dimensions) {
      if (dimension.evidence !== null) {
        expect(STUDENT_LINES.some((line) => line.includes(dimension.evidence ?? ""))).toBe(true);
      }
    }
  });

  it("does not quote flagged student turns", async () => {
    const provider = new FakeProvider({
      overrides: {
        score: () => ({
          ...modelScorecard(),
          strongerLine: { original: "flagged words here", improved: "x" },
        }),
      },
    });
    const transcript = [
      ...transcriptOf(STUDENT_LINES),
      { role: "student" as const, text: "flagged words here", flagged: true },
    ];
    const res = await post(start(provider), "/v1/score", request({ transcript }));
    const { scorecard } = CoachScoreResponseSchema.parse(res.json());
    expect(scorecard.strongerLine.original).not.toBe("flagged words here");
  });

  it("answers 400 not_enough_turns when no student has spoken", async () => {
    const res = await post(
      start(),
      "/v1/score",
      request({ transcript: [{ role: "partner", text: "Hello?" }] }),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "not_enough_turns" } });
  });

  it("rejects an invalid body with 400 validation_failed", async () => {
    const res = await post(start(), "/v1/score", { ...request(), transcript: [] });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "validation_failed" } });
  });

  it("retries once with the validation error, then succeeds", async () => {
    const calls: string[][] = [];
    const provider = new FakeProvider({
      overrides: {
        score: ({ messages }) => {
          calls.push(messages.map((m) => m.content));
          return calls.length === 1 ? { ...modelScorecard(), strengths: [] } : modelScorecard();
        },
      },
    });
    const res = await post(start(provider), "/v1/score", request());
    expect(res.statusCode).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.at(-1)).toMatch(/did not match/i);
    expect(calls[1]?.at(-1)).toContain("strengths");
  });

  it("answers 502 upstream_error when the scorecard is invalid twice", async () => {
    const provider = new FakeProvider({ overrides: { score: () => ({ overall: 1 }) } });
    const res = await post(start(provider), "/v1/score", request());
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ error: { code: "upstream_error" } });
  });

  it("reports the usage of both rejected scorecards with the error", async () => {
    const rejected = { overall: 1 };
    const provider = new FakeProvider({ overrides: { score: () => rejected } });
    const res = await post(start(provider), "/v1/score", request());
    const { usage } = res.json<{ usage: { inputTokens: number; outputTokens: number } }>();
    // The provider reported real figures for both calls (about four characters a token), so
    // nothing is estimated.
    expect(usage.outputTokens).toBe(2 * Math.ceil(JSON.stringify(rejected).length / 4));
    expect(usage.inputTokens).toBeGreaterThan(0);
  });
});
