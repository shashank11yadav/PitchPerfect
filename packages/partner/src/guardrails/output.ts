import { LIMITS } from "@pitchperfect/shared";
import { containsCanary } from "./canary.js";
import { replyRuleCheck } from "./reply-rules.js";

const LINK = /\[([^\]]*)\]\([^)]*\)/g;
const HEADING = /^[ \t]{0,3}#{1,6}[ \t]+/gm;
// Only a marker followed by a letter: "- 20% off" and "2024. We grew" keep their numbers.
const LIST_MARKER = /^[ \t]*(?:[-*•]|\d{1,2}[.)])(?:[ \t]+(?=[\p{L}*_])|[ \t]*$)/gmu;
// A lone asterisk between word characters ("2x*3") is not emphasis.
const EMPHASIS = /\*{2,}|(?<!\w)\*|\*(?!\w)|__|`+/g;
const SENTENCE_END = /[.!?]["')\]”’]*(?=\s|$)/g;

function stripMarkdown(text: string): string {
  return text
    .replace(LINK, "$1")
    .replace(HEADING, "")
    .replace(LIST_MARKER, "")
    .replace(EMPHASIS, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strips markdown and list markers, then keeps at most `maxWords` words, cut after the last
 * sentence end. With no sentence end past half the limit it cuts at the limit and adds an ellipsis.
 */
export function capReply(text: string, maxWords: number = LIMITS.replyMaxWords): string {
  const clean = stripMarkdown(text);
  const words = clean.split(" ");
  if (words.length <= maxWords) return clean;

  const head = words.slice(0, maxWords).join(" ");
  let cut = -1;
  for (const match of head.matchAll(SENTENCE_END)) cut = match.index + match[0].length;
  // A sentence end in the first half of the budget would throw away most of the reply.
  if (cut > 0 && head.slice(0, cut).split(" ").length >= maxWords / 2) return head.slice(0, cut);
  return `${head.replace(/[\s,;:–-]+$/, "")}…`;
}

export type OutputCheck =
  { ok: true; text: string } | { ok: false; reason: "canary" | "rules" | "moderation" | "empty" };

/** Resolves true when moderation flags the text. It fails closed: an error counts as flagged. */
export type FlagCheck = (text: string) => Promise<boolean>;

/**
 * Checks a whole model reply before it is final: canary leak, the local reply rules (on the raw
 * text, so a markdown link's address is seen), markdown/length cleanup, then moderation when the
 * host has a moderator.
 */
export async function checkOutput(text: string, flagged?: FlagCheck): Promise<OutputCheck> {
  if (containsCanary(text)) return { ok: false, reason: "canary" };
  if (replyRuleCheck(text) !== null) return { ok: false, reason: "rules" };

  const cleaned = capReply(text);
  if (cleaned === "") return { ok: false, reason: "empty" };

  if (flagged && (await flagged(cleaned))) return { ok: false, reason: "moderation" };
  return { ok: true, text: cleaned };
}
