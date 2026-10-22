import { describe, expect, it } from "vitest";
import { LIMITS, type CoachTurnRequest } from "@pitchperfect/shared";
import { estimateUnansweredTurn } from "./text.js";

describe("estimateUnansweredTurn", () => {
  it("charges a quarter token per request character and the full reply cap", () => {
    const request = { studentText: "x".repeat(37) } as unknown as CoachTurnRequest;
    const chars = JSON.stringify(request).length;
    expect(estimateUnansweredTurn(request)).toEqual({
      inputTokens: Math.ceil(chars / 4),
      outputTokens: LIMITS.maxTokensReply,
    });
  });
});
