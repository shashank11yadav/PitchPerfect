import {
  LIMITS,
  type CoachPlanRequest,
  type CoachScoreRequest,
  type CoachTurnRequest,
  type Usage,
} from "@pitchperfect/shared";

type TokenUsage = Pick<Usage, "inputTokens" | "outputTokens">;

/**
 * The instructions each model call carries besides the request: about 1,050 tokens in the
 * current prompts, rounded up so the estimates err high.
 */
const PROMPT_TOKENS = 1500;

/**
 * Usage for coach work the coach never reported, an upper-bound estimate: the request's JSON at
 * about four characters per token plus the instructions of each model call, and the full output
 * cap of each call.
 */
function estimate(request: object, outputCaps: readonly number[]): TokenUsage {
  return {
    inputTokens: Math.ceil(JSON.stringify(request).length / 4) + PROMPT_TOKENS * outputCaps.length,
    outputTokens: outputCaps.reduce((sum, cap) => sum + cap, 0),
  };
}

/**
 * A turn the coach started but never finished (the client left, or it failed without saying
 * what it used): the guard, the reply and one moderation check.
 */
export const estimateUnansweredTurn = (request: CoachTurnRequest): TokenUsage =>
  estimate(request, [LIMITS.maxTokensGuard, LIMITS.maxTokensReply, LIMITS.maxTokensModeration]);

/** A plan the coach never answered, or answered without saying what it used. */
export const estimateFailedPlan = (request: CoachPlanRequest): TokenUsage =>
  estimate(request, [LIMITS.maxTokensPlan]);

/** A score the coach never answered, or answered without saying what it used. */
export const estimateFailedScore = (request: CoachScoreRequest): TokenUsage =>
  estimate(request, [LIMITS.maxTokensScore]);
