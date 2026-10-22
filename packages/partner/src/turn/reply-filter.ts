import { STAGES, type Stage } from "@pitchperfect/shared";
import { containsCanary } from "../guardrails/canary.js";
import { ruleCheck } from "../guardrails/guard-rules.js";

const STAGE_TAG = /\[\[\s*stage\s*:\s*([a-z]*)\s*\]\]/gi;
// A tag cut off by the token limit, e.g. "[[stage:obj".
const CUT_TAG = /\[\[[^\]]*\]?$/;
// Characters containsCanary() reads as part of the canary id: hex digits plus the separators it ignores.
const CANARY_TAIL = new RegExp("[0-9a-f\\s\\-\\u200b-\\u200f\\u2060\\ufeff\\u00ad]*$", "i");
const WORD = /[\p{L}\p{N}]+/gu;

/** Words held back while streaming, so a 5-word run of the instructions is caught before it shows. */
export const HOLD_WORDS = 8;

const isStage = (value: string): value is Stage => (STAGES as readonly string[]).includes(value);

/** Removes every `[[stage:x]]` tag (and a cut-off one at the end); the last valid tag names the stage. */
export function splitStageTag(reply: string): { text: string; stage: Stage | undefined } {
  let stage: Stage | undefined;
  for (const match of reply.matchAll(STAGE_TAG)) {
    const name = (match[1] ?? "").toLowerCase();
    if (isStage(name)) stage = name;
  }
  const text = reply.replace(STAGE_TAG, " ").replace(CUT_TAG, "").replace(/\s+/g, " ").trim();
  return { text, stage };
}

/** Why a reply stopped streaming: a leak (canary or instructions) or harmful text. */
export type BlockReason = "canary" | "instructions" | "harmful";

/**
 * Decides which part of a streaming reply is safe to show yet. It holds back the last
 * {@link HOLD_WORDS} words, everything from a `[[` (a stage tag, possibly split across deltas), a
 * lone trailing `[`, and a trailing run that could still grow into the canary. Before releasing
 * anything it checks the whole text for the canary, a run of the instructions, and harmful
 * content; on a hit it is blocked for good and releases nothing more.
 */
export class ReplyFilter {
  readonly #leaks: (text: string) => boolean;
  #text = "";
  #emitted = 0;
  #blocked: BlockReason | undefined;

  constructor(leaks: (text: string) => boolean) {
    this.#leaks = leaks;
  }

  /** Adds a delta and returns the newly safe text (possibly empty). */
  push(delta: string): string {
    this.#text += delta;
    if (this.#scan()) return "";
    const text = this.#text;
    const tokens = Array.from(text.matchAll(WORD));
    const wordLimit =
      tokens.length > HOLD_WORDS ? (tokens[tokens.length - HOLD_WORDS]?.index ?? 0) : 0;
    const canaryLimit = text.length - (CANARY_TAIL.exec(text)?.[0].length ?? 0);
    const tagLimit = text.endsWith("[") ? text.length - 1 : text.length;
    return this.#release(Math.min(this.#tagStart(tagLimit), canaryLimit, wordLimit));
  }

  /** At the end of the stream: everything not yet shown except the stage tag. */
  finish(): string {
    if (this.#scan()) return "";
    return this.#release(this.#tagStart(this.#text.length));
  }

  /** Everything received so far, tag included. */
  get text(): string {
    return this.#text;
  }

  get blocked(): BlockReason | undefined {
    return this.#blocked;
  }

  #tagStart(otherwise: number): number {
    const at = this.#text.indexOf("[[");
    return at >= 0 ? at : otherwise;
  }

  #release(limit: number): string {
    const safe = Math.max(this.#emitted, limit);
    const out = this.#text.slice(this.#emitted, safe);
    this.#emitted = safe;
    return out;
  }

  /** True once the text is blocked; checks the canary, instruction runs, and harmful content. */
  #scan(): boolean {
    if (this.#blocked) return true;
    if (containsCanary(this.#text)) this.#blocked = "canary";
    else if (this.#leaks(this.#text)) this.#blocked = "instructions";
    else if (ruleCheck(this.#text) === "harmful") this.#blocked = "harmful";
    return this.#blocked !== undefined;
  }
}
