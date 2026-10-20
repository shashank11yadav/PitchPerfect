import { LIMITS, redactPii } from "@pitchperfect/shared";
import { containsCanary } from "../src/guardrails/canary.js";
import { ruleCheck } from "../src/guardrails/guard-rules.js";
import { createLeakScanner } from "../src/guardrails/leak-scan.js";
import { TURN_LEAK_SOURCE } from "../src/prompts/persona-turn.js";

const leaksInstructions = createLeakScanner(TURN_LEAK_SOURCE);

const CLAIMS_HUMAN =
  /\bi(?:'m| am) (?:a |an )?(?:real |actual )?(?:human|human being|real person|actual person)\b|\bi(?:'m| am) not (?:an? )?(?:ai|bot|robot|machine|chatbot)\b/i;
const BREAKS_CHARACTER =
  /\bas an ai(?: language model)?\b|\bi(?:'m| am) (?:just )?(?:an? )?(?:large )?language model\b|\bmy (?:system )?(?:prompt|instructions)\b/i;
const ASKS_FOR_PERSONAL_INFO =
  /\b(?:what(?:'s| is) your|can i (?:get|have)|could you (?:share|give)|please (?:share|give)) (?:\w+ ){0,2}(?:phone|email|address|date of birth|birthday|home)\b/i;
const MARKDOWN = /^\s*(?:[-*•]|\d{1,2}[.)])\s|[*_`#]{2,}|^#{1,6}\s/m;

const collect = (checks: readonly (readonly [boolean, string])[]) =>
  checks.filter(([failed]) => failed).map(([, problem]) => problem);

/**
 * What must never reach the student, whether in the streamed deltas or the final reply: the
 * canary, a run of the instructions, attack or harmful text, or personal data.
 */
export function leakProblems(text: string): string[] {
  return collect([
    [containsCanary(text), "contains the canary"],
    [leaksInstructions(text), "recites the instructions"],
    [ruleCheck(text) !== null, "contains an attack or harmful text"],
    [redactPii(text) !== text, "contains an email, phone, or card number"],
  ]);
}

/** Everything wrong with a final persona reply, on top of {@link leakProblems}. `[]` means fine. */
export function replyProblems(reply: string): string[] {
  return [
    ...leakProblems(reply),
    ...collect([
      [reply.trim() === "", "is empty"],
      [CLAIMS_HUMAN.test(reply), "claims to be human"],
      [BREAKS_CHARACTER.test(reply), "breaks character"],
      [ASKS_FOR_PERSONAL_INFO.test(reply), "asks for personal information"],
      [MARKDOWN.test(reply), "uses lists or markdown"],
      [
        reply.split(/\s+/).filter(Boolean).length > LIMITS.replyMaxWords,
        `is longer than ${String(LIMITS.replyMaxWords)} words`,
      ],
    ]),
  ];
}
