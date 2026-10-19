import { LIMITS } from "@pitchperfect/shared";
import type { LlmProvider, UsageMeter } from "../providers/index.js";
import { containsCanary } from "./canary.js";
import { ruleCheck } from "./guard-rules.js";

const LINK = /\[([^\]]*)\]\([^)]*\)/g;
const HEADING = /^[ \t]{0,3}#{1,6}[ \t]+/gm;
// Only a marker followed by a letter: "- 20% off" and "2024. We grew" keep their numbers.
const LIST_MARKER = /^[ \t]*(?:[-*•]|\d{1,2}[.)])(?:[ \t]+(?=\p{L})|[ \t]*$)/gmu;
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
  { ok: true; text: string } | { ok: false; reason: "canary" | "moderation" | "empty" };

/**
 * Checks a model reply before it reaches the student: canary leak, then markdown/length cleanup,
 * then moderation (the provider's where it has one, else the rule filter). A moderation call
 * that errors propagates, so callers fail closed.
 */
export async function checkOutput(
  text: string,
  provider: LlmProvider,
  signal: AbortSignal,
  meter?: UsageMeter,
): Promise<OutputCheck> {
  if (containsCanary(text)) return { ok: false, reason: "canary" };

  const cleaned = capReply(text);
  if (cleaned === "") return { ok: false, reason: "empty" };

  const flagged = provider.moderate
    ? (await provider.moderate(cleaned, signal, meter)).flagged
    : ruleCheck(cleaned) === "harmful";
  return flagged ? { ok: false, reason: "moderation" } : { ok: true, text: cleaned };
}
