import { LIMITS, type CoachTurnRequest, type Usage } from "@pitchperfect/shared";

/**
 * Usage charged for a turn the coach started but never finished (client left, or an `error`
 * event): the coach reports no usage then, so this is an upper-bound estimate. Input is the
 * request's JSON size at about four characters per token; output is the full reply cap.
 */
export function estimateUnansweredTurn(
  request: CoachTurnRequest,
): Pick<Usage, "inputTokens" | "outputTokens"> {
  return {
    inputTokens: Math.ceil(JSON.stringify(request).length / 4),
    outputTokens: LIMITS.maxTokensReply,
  };
}
