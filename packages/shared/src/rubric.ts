import { z } from "zod";
import { LIMITS } from "./limits.js";

export const RUBRIC_KEYS = [
  "clarity",
  "value",
  "structure",
  "discovery",
  "objections",
  "confidence",
  "cta",
] as const;
export type RubricKey = (typeof RUBRIC_KEYS)[number];

export interface RubricDimension {
  key: RubricKey;
  name: string;
  low: string;
  high: string;
}

export const RUBRIC_DIMENSIONS: readonly RubricDimension[] = [
  {
    key: "clarity",
    name: "Clarity",
    low: "Rambling, jargon, unclear point",
    high: "Crisp, one clear message",
  },
  {
    key: "value",
    name: "Value & relevance",
    low: "Features only, generic",
    high: "Benefits tied to this buyer's stated needs",
  },
  {
    key: "structure",
    name: "Structure",
    low: "No flow",
    high: "Clear opening, body, and close",
  },
  {
    key: "discovery",
    name: "Discovery questions",
    low: "No questions or only yes/no",
    high: "Open, layered questions that uncover pain and impact",
  },
  {
    key: "objections",
    name: "Objection handling",
    low: "Ignores or argues",
    high: "Acknowledges, clarifies, responds with evidence, checks",
  },
  {
    key: "confidence",
    name: "Confidence & language",
    low: "Hedging, filler, apologetic",
    high: "Assured, concise, positive framing",
  },
  {
    key: "cta",
    name: "Call to action",
    low: "No ask",
    high: "Specific, time-bound next step",
  },
];

const rubricKey = z.enum(RUBRIC_KEYS);
const score = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
const listOfThree = z
  .array(z.string().min(1).max(LIMITS.scorecardListItemMaxLength))
  .length(LIMITS.scorecardListSize);

export const ScorecardSchema = z.strictObject({
  overall: z.number().int().min(0).max(100),
  dimensions: z
    .array(
      z.strictObject({
        key: rubricKey,
        score,
        justification: z.string().min(1).max(LIMITS.justificationMaxLength),
        evidence: z.string().min(1).max(LIMITS.evidenceMaxLength).nullable(),
      }),
    )
    .length(RUBRIC_KEYS.length)
    .refine((dimensions) => new Set(dimensions.map((d) => d.key)).size === RUBRIC_KEYS.length, {
      message: "Each rubric dimension must appear exactly once",
    }),
  strengths: listOfThree,
  improvements: listOfThree,
  strongerLine: z.strictObject({
    original: z.string().min(1).max(LIMITS.transcriptEntryMaxLength),
    improved: z.string().min(1).max(LIMITS.transcriptEntryMaxLength),
  }),
});
export type Scorecard = z.infer<typeof ScorecardSchema>;

/**
 * Weighted mean of the dimension scores (the skill's weighted dimension counts double),
 * mapped linearly from 1–5 onto 0–100 and rounded.
 */
export function computeOverall(
  dimensions: readonly { key: RubricKey; score: 1 | 2 | 3 | 4 | 5 }[],
  weighted: RubricKey,
): number {
  if (dimensions.length === 0) throw new RangeError("Cannot score zero dimensions");
  let weightedSum = 0;
  let totalWeight = 0;
  for (const dimension of dimensions) {
    const weight = dimension.key === weighted ? 2 : 1;
    weightedSum += dimension.score * weight;
    totalWeight += weight;
  }
  // ((sum / weight) - 1) / 4 * 100, arranged to stay exact for typical inputs.
  return Math.round(((weightedSum - totalWeight) * 25) / totalWeight);
}
