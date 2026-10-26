import { containsCanary } from "./canary.js";
import { replyRuleCheck } from "./reply-rules.js";

const LINK = /\[([^\]]*)\]\([^)]*\)/g;
const HEADING = /^[ \t]{0,3}#{1,6}[ \t]+/gm;
// Only a marker followed by a letter: "- 20% off" and "2024. We grew" keep their numbers.
const LIST_MARKER = /^[ \t]*(?:[-*•]|\d{1,2}[.)])(?:[ \t]+(?=[\p{L}*_])|[ \t]*$)/gmu;
// A lone asterisk between word characters ("2x*3") is not emphasis.
const EMPHASIS = /\*{2,}|(?<!\w)\*|\*(?!\w)|__|`+/g;

/**
 * Text as it is spoken: markdown links, headings, list markers and emphasis stripped, whitespace
 * collapsed to single spaces, trimmed.
 */
export function plainText(text: string): string {
  return text
    .replace(LINK, "$1")
    .replace(HEADING, "")
    .replace(LIST_MARKER, "")
    .replace(EMPHASIS, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type OutputCheck =
  { ok: true; text: string } | { ok: false; reason: "canary" | "rules" | "moderation" | "empty" };

/** Resolves true when moderation flags the text. It fails closed: an error counts as flagged. */
export type FlagCheck = (text: string) => Promise<boolean>;

/**
 * Checks a whole reply in the form it is shown, spoken and stored (the sentence gate has already
 * made it plain text within the word cap): canary leak, the local reply rules, then moderation when
 * `flagged` is given.
 */
export async function checkOutput(text: string, flagged?: FlagCheck): Promise<OutputCheck> {
  if (containsCanary(text)) return { ok: false, reason: "canary" };
  if (replyRuleCheck(text) !== null) return { ok: false, reason: "rules" };
  if (text.trim() === "") return { ok: false, reason: "empty" };
  if (flagged && (await flagged(text))) return { ok: false, reason: "moderation" };
  return { ok: true, text };
}
