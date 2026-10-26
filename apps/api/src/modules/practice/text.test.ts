import { describe, expect, it } from "vitest";
import {
  LIMITS,
  type CoachPlanRequest,
  type CoachScoreRequest,
  type CoachTurnRequest,
} from "@pitchperfect/shared";
import { estimateFailedPlan, estimateFailedScore, estimateUnansweredTurn } from "./text.js";

/** The instructions each model call carries, as the estimates count them. */
const PROMPT_TOKENS = 1500;

describe("estimateUnansweredTurn", () => {
  it("charges the request and the instructions of the guard, the reply and one check", () => {
    const request = { studentText: "x".repeat(37) } as unknown as CoachTurnRequest;
    const chars = JSON.stringify(request).length;
    expect(estimateUnansweredTurn(request)).toEqual({
      inputTokens: Math.ceil(chars / 4) + 3 * PROMPT_TOKENS,
      outputTokens: LIMITS.maxTokensGuard + LIMITS.maxTokensReply + LIMITS.maxTokensModeration,
    });
  });
});

describe("estimates for a failed plan or score", () => {
  it("charge the request, one call's instructions and the step's output cap", () => {
    const plan: CoachPlanRequest = { skill: "pitching" };
    expect(estimateFailedPlan(plan)).toEqual({
      inputTokens: Math.ceil(JSON.stringify(plan).length / 4) + PROMPT_TOKENS,
      outputTokens: LIMITS.maxTokensPlan,
    });
    const score = { skill: "pitching", transcript: [] } as unknown as CoachScoreRequest;
    expect(estimateFailedScore(score)).toEqual({
      inputTokens: Math.ceil(JSON.stringify(score).length / 4) + PROMPT_TOKENS,
      outputTokens: LIMITS.maxTokensScore,
    });
  });
});
