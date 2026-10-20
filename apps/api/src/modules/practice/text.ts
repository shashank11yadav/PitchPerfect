import {
  countChars,
  LIMITS,
  normalizeTurnText,
  redactPii,
  type CoachTurnRequest,
  type Usage,
} from "@pitchperfect/shared";

const clip = (text: string) => Array.from(text).slice(0, LIMITS.turnMaxChars).join("");

/** A placeholder such as `[email]` cut short at the end of the text. */
const CUT_PLACEHOLDER = /\[[a-z]*$/;

/**
 * The student's text as it is stored and forwarded: normalized, clipped to the turn limit, then
 * PII-redacted. A placeholder can be longer than what it replaced; if that pushes the text over
 * the limit, the text is clipped again and a placeholder cut in half is dropped, never kept partial.
 */
export function redactTurn(text: string): string {
  const redacted = redactPii(clip(normalizeTurnText(text)));
  if (countChars(redacted) <= LIMITS.turnMaxChars) return redacted;
  return clip(redacted).replace(CUT_PLACEHOLDER, "").trimEnd();
}

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
