import { STAGES, type Stage } from "@pitchperfect/shared";
import { containsCanary } from "../guardrails/canary.js";

const STAGE_TAG = /\[\[\s*stage\s*:\s*([a-z]*)\s*\]\]/gi;
// A tag cut off by the token limit, e.g. "[[stage:obj".
const CUT_TAG = /\[\[[^\]]*\]?$/;
// Characters containsCanary() reads as part of the canary id: hex digits plus the separators it ignores.
const CANARY_TAIL = new RegExp("[0-9a-f\\s\\-\\u200b-\\u200f\\u2060\\ufeff\\u00ad]*$", "i");

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

/**
 * Decides which part of a streaming reply is safe to show yet. It holds back everything from a
 * `[[` (a stage tag, possibly split across deltas), a lone trailing `[`, and a trailing run of
 * characters that could still grow into the canary. Once the canary appears, it emits nothing more.
 */
export class ReplyFilter {
  #text = "";
  #emitted = 0;
  #leaked = false;

  /** Adds a delta and returns the newly safe text (possibly empty). */
  push(delta: string): string {
    this.#text += delta;
    if (this.#leaked || containsCanary(this.#text)) {
      this.#leaked = true;
      return "";
    }
    const text = this.#text;
    const tagAt = text.indexOf("[[");
    const tagLimit = tagAt >= 0 ? tagAt : text.endsWith("[") ? text.length - 1 : text.length;
    const canaryLimit = text.length - (CANARY_TAIL.exec(text)?.[0].length ?? 0);
    const safe = Math.max(this.#emitted, Math.min(tagLimit, canaryLimit));
    const out = text.slice(this.#emitted, safe);
    this.#emitted = safe;
    return out;
  }

  /** Everything received so far, tag included. */
  get text(): string {
    return this.#text;
  }

  get leaked(): boolean {
    return this.#leaked;
  }
}
