import { describe, expect, it } from "vitest";
import { countChars, LIMITS, type CoachTurnRequest } from "@pitchperfect/shared";
import { estimateUnansweredTurn, redactTurn } from "./text.js";

describe("redactTurn", () => {
  it("normalizes and redacts personal data", () => {
    expect(redactTurn("  Call  me at 617-555-0100\u0000 or a.b@example.test ")).toBe(
      "Call me at [phone] or [email]",
    );
  });

  it("keeps a placeholder that fits within the limit", () => {
    const text = `${"z".repeat(990)} a@b.co`;
    expect(redactTurn(text)).toBe(`${"z".repeat(990)} [email]`);
  });

  it("drops a placeholder that redaction pushed past the limit instead of cutting it", () => {
    // 1000 characters; "[email]" is one character longer than "a@b.co".
    const text = `${"z".repeat(LIMITS.turnMaxChars - 7)} a@b.co`;
    expect(countChars(text)).toBe(LIMITS.turnMaxChars);
    expect(redactTurn(text)).toBe("z".repeat(LIMITS.turnMaxChars - 7));
  });
});

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
