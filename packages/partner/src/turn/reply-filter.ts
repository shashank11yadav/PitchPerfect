import { STAGES, stripInvisible, type Stage } from "@pitchperfect/shared";
import { containsCanary } from "../guardrails/canary.js";
import { replyRuleCheck } from "../guardrails/reply-rules.js";

/** The longest text inside a hidden marker such as `[[stage:objection]]`. */
const MARKER_CHARS = 40;
/** A hidden marker, anywhere in the reply: `[[stage:pitch]]`. */
const MARKER = new RegExp(`\\[\\[[^[\\]]{0,${String(MARKER_CHARS)}}\\]\\]`, "g");
/** The stage a marker names, when it names one. */
const STAGE_MARKER = /^\[\[\s*stage\s*:\s*([a-z]*)\s*\]\]$/i;
/** At the end of the text so far: a `[` that may begin a marker, or a marker not yet closed. */
const OPEN_MARKER = new RegExp(`\\[(?:\\[[^[\\]]{0,${String(MARKER_CHARS)}}\\]?)?$`);
/** At the end of the stream: a marker cut off by the token limit, e.g. "[[stage:obj". */
const CUT_MARKER = new RegExp(`\\[\\[[^[\\]]{0,${String(MARKER_CHARS)}}\\]?$`);
/** Scripts written without spaces between words: each character is counted as a word. */
const UNSPACED = "\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}";
const WORD = new RegExp(`[${UNSPACED}]|(?:(?![${UNSPACED}])[\\p{L}\\p{N}])+`, "gu");

/**
 * Words held back while streaming, so a 5-word run of the instructions is caught before it shows,
 * and a canary spelled out one character at a time is caught before half of it does. In Chinese
 * and Japanese, each character counts as a word.
 */
export const HOLD_WORDS = 8;

const isStage = (value: string): value is Stage => (STAGES as readonly string[]).includes(value);

/** The text a reader gets: invisible characters stripped, each complete marker a space. */
const visibleOf = (reply: string) => stripInvisible(reply).replace(MARKER, " ");

/**
 * Removes every hidden marker (and one cut off at the end) and invisible characters, and collapses
 * whitespace; the last valid `[[stage:x]]` names the stage. Text before, between and after markers
 * is all kept.
 */
export function splitStageTag(reply: string): { text: string; stage: Stage | undefined } {
  const text = visibleOf(reply).replace(CUT_MARKER, "").replace(/\s+/g, " ").trim();
  return { text, stage: stageOf(reply) };
}

/** The stage the last valid stage marker names. */
function stageOf(reply: string): Stage | undefined {
  let stage: Stage | undefined;
  for (const [marker] of stripInvisible(reply).matchAll(MARKER)) {
    const name = (STAGE_MARKER.exec(marker)?.[1] ?? "").toLowerCase();
    if (isStage(name)) stage = name;
  }
  return stage;
}

/**
 * Why a reply stopped streaming: a leak (the canary, or the instructions: rule text, the hidden part
 * of the scenario, or a secret spread over the session's replies) or a local reply rule.
 */
export type BlockReason = "canary" | "instructions" | "rules";

/**
 * Decides which part of a streaming reply is safe to show yet. It releases the visible text:
 * invisible characters stripped and every hidden marker replaced by a space, so text after a
 * marker streams on and goes through the same checks as text before it. It holds back the last
 * {@link HOLD_WORDS} words and a marker that is not yet closed. Before releasing anything it checks
 * the whole raw text so far, not just the newest sentence, for the canary, a leak of the
 * instructions, and the local reply rules, so a secret split across sentences is caught once its
 * last piece arrives and text hidden in invisible characters is read too; on a hit it is blocked
 * for good and releases nothing more.
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
    if (this.#scan(true)) return "";
    const visible = visibleOf(this.#text);
    const tokens = Array.from(visible.matchAll(WORD));
    const wordLimit =
      tokens.length > HOLD_WORDS ? (tokens[tokens.length - HOLD_WORDS]?.index ?? 0) : 0;
    const markerLimit = OPEN_MARKER.exec(visible)?.index ?? visible.length;
    return this.#release(visible, Math.min(markerLimit, wordLimit));
  }

  /** At the end of the stream: everything not yet shown, less a cut-off marker. */
  finish(): string {
    if (this.#scan(false)) return "";
    const visible = visibleOf(this.#text).replace(CUT_MARKER, "");
    return this.#release(visible, visible.length);
  }

  /** Everything received so far, markers and invisible characters included. */
  get text(): string {
    return this.#text;
  }

  /** The stage the last valid stage marker so far names. */
  get stage(): Stage | undefined {
    return stageOf(this.#text);
  }

  get blocked(): BlockReason | undefined {
    return this.#blocked;
  }

  #release(visible: string, limit: number): string {
    const safe = Math.max(this.#emitted, limit);
    const out = visible.slice(this.#emitted, safe);
    this.#emitted = safe;
    return out;
  }

  /**
   * True once the text is blocked; checks the canary, instruction leaks, and the reply rules. They
   * read the text with each marker as a space, so a marker can't split a phrase they look for, and
   * with its invisible characters, which the leak checks decode. While `partial`, the end of the
   * text is not yet the end of a sentence.
   */
  #scan(partial: boolean): boolean {
    if (this.#blocked) return true;
    const text = this.#text.replace(MARKER, " ");
    if (containsCanary(text)) this.#blocked = "canary";
    else if (this.#leaks(text)) this.#blocked = "instructions";
    else if (replyRuleCheck(text, { partial }) !== null) this.#blocked = "rules";
    return this.#blocked !== undefined;
  }
}
