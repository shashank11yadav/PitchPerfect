import { z } from "zod";
import { LLM_PROVIDERS, STAGES } from "../enums.js";
import { LIMITS } from "../limits.js";
import { ScorecardSchema } from "../rubric.js";
import { SKILL_SLUGS } from "../skills.js";
import { turnText } from "./common.js";

export const skillSlug = () => z.enum(SKILL_SLUGS);

const StageSchema = z.enum(STAGES);

export const UsageSchema = z.strictObject({
  provider: z.enum(LLM_PROVIDERS),
  model: z.string().min(1).max(LIMITS.modelNameMaxLength),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});
export type Usage = z.infer<typeof UsageSchema>;

export const ScenarioPublicSchema = z.strictObject({
  personaName: z.string().trim().min(1).max(LIMITS.personaNameMaxLength),
  personaTitle: z.string().trim().min(1).max(LIMITS.personaTextMaxLength),
  companyType: z.string().trim().min(1).max(LIMITS.personaTextMaxLength),
  personality: z.string().trim().min(1).max(LIMITS.personaTextMaxLength),
  openingLine: z.string().trim().min(1).max(LIMITS.openingLineMaxLength),
});
export type ScenarioPublic = z.infer<typeof ScenarioPublicSchema>;

const scenarioItem = () => z.string().trim().min(1).max(LIMITS.scenarioListMaxItemLength);

/** Never sent to browsers. */
export const ScenarioPrivateSchema = z.strictObject({
  hiddenObjections: z
    .array(scenarioItem())
    .min(LIMITS.hiddenObjectionsMin)
    .max(LIMITS.hiddenObjectionsMax),
  winConditions: z.array(scenarioItem()).min(LIMITS.winConditionsMin).max(LIMITS.winConditionsMax),
});
export type ScenarioPrivate = z.infer<typeof ScenarioPrivateSchema>;

export const TranscriptEntrySchema = z.strictObject({
  role: z.enum(["student", "partner"]),
  text: z.string().min(1).max(LIMITS.transcriptEntryMaxLength),
  at: z.iso.datetime({ offset: true }).optional(),
  flagged: z.boolean().optional(),
});
export type TranscriptEntry = z.infer<typeof TranscriptEntrySchema>;

const transcript = () => z.array(TranscriptEntrySchema).max(LIMITS.transcriptMaxEntries);

const scenarioContext = {
  skill: skillSlug(),
  scenarioPublic: ScenarioPublicSchema,
  scenarioPrivate: ScenarioPrivateSchema,
};

export const CoachPlanRequestSchema = z.strictObject({
  skill: skillSlug(),
  targetRole: z.string().trim().min(1).max(LIMITS.profileTextMaxLength).optional(),
  industry: z.string().trim().min(1).max(LIMITS.profileTextMaxLength).optional(),
  job: z
    .strictObject({
      title: z.string().trim().min(1).max(LIMITS.jobTitleMaxLength),
      descriptionText: z.string().max(LIMITS.jobDescriptionMaxChars),
      skills: z
        .array(z.string().trim().min(1).max(LIMITS.jobSkillMaxLength))
        .max(LIMITS.jobSkillsMax),
    })
    .optional(),
});
export type CoachPlanRequest = z.infer<typeof CoachPlanRequestSchema>;

export const CoachPlanResponseSchema = z.strictObject({
  scenarioPublic: ScenarioPublicSchema,
  scenarioPrivate: ScenarioPrivateSchema,
  usage: UsageSchema,
});
export type CoachPlanResponse = z.infer<typeof CoachPlanResponseSchema>;

export const CoachTurnRequestSchema = z.strictObject({
  ...scenarioContext,
  transcript: transcript(),
  studentText: turnText(),
  /** The stage the api has stored for the attempt; the coach never moves backwards from it. */
  currentStage: StageSchema.optional(),
});
export type CoachTurnRequest = z.infer<typeof CoachTurnRequestSchema>;

export const CoachScoreRequestSchema = z.strictObject({
  ...scenarioContext,
  transcript: transcript().min(1),
});
export type CoachScoreRequest = z.infer<typeof CoachScoreRequestSchema>;

export const CoachScoreResponseSchema = z.strictObject({
  scorecard: ScorecardSchema,
  usage: UsageSchema,
});
export type CoachScoreResponse = z.infer<typeof CoachScoreResponseSchema>;

/**
 * Events the coach streams for `/v1/turn`. Every `delta` has passed the output check. `retract`
 * withdraws everything streamed so far in the turn, and its `text` is shown in its place.
 */
export const CoachTurnEvent = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("delta"), text: z.string() }),
  z.strictObject({ type: z.literal("retract"), text: z.string() }),
  z.strictObject({
    type: z.literal("done"),
    stage: StageSchema,
    finalText: z.string(),
    usage: UsageSchema,
  }),
  z.strictObject({
    type: z.literal("redirect"),
    text: z.string(),
    /** True only for a confirmed attack; it counts toward the guard-flag limit. */
    strike: z.boolean(),
    usage: UsageSchema,
  }),
  /**
   * The student's turn signalled self-harm. `text` is an out-of-character support message with
   * crisis resources, sent instead of a reply or a redirect; it is never a strike.
   */
  z.strictObject({ type: z.literal("support"), text: z.string(), usage: UsageSchema }),
  /** `usage`: what the turn's provider calls had used before it failed. */
  z.strictObject({
    type: z.literal("error"),
    code: z.string().min(1),
    usage: UsageSchema.optional(),
  }),
]);
export type CoachTurnEvent = z.infer<typeof CoachTurnEvent>;

/**
 * The body of a coach error. A plan or score that failed after calling the provider also reports
 * what those calls used, so the api can charge it.
 */
export const CoachErrorBodySchema = z.object({
  error: z.object({ code: z.string() }),
  usage: UsageSchema.optional(),
});
