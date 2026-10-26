import { countChars, LIMITS, redactReply } from "@pitchperfect/shared";
import { plainText } from "../guardrails/output.js";

/** Quotes and brackets that may close a sentence after its terminal punctuation. */
const CLOSERS = "[\"')\\]”’」』）】〉》〕］｝]*";
/**
 * A sentence end. Latin punctuation needs whitespace after it, so "3.5" is not an end. The Chinese
 * and Japanese full stops and full-width marks (。．｡！？), the Devanagari danda (। ॥) and the
 * Arabic question mark and full stop (؟ ۔) end a sentence with or without whitespace after them.
 */
const SENTENCE_END = new RegExp(`[.!?…]+${CLOSERS}\\s+|[。．｡！？।॥؟۔]+${CLOSERS}\\s*`, "gu");
/** What a cut in the middle of a sentence drops from its end before the ellipsis. */
const CUT_END = /[\s,;:–、，-]+$/;
/** A placeholder such as `[phone]` that a cut at the character cap split. */
const CUT_PLACEHOLDER = /\[[a-z]*$/;
const ELLIPSIS = "…";

/** Checks one reply may have in flight at once. */
const CHECK_CONCURRENCY = 2;

export interface GateOptions {
  /** The reply's word cap; nothing past it is checked or emitted. */
  maxWords?: number;
  /** The reply's character cap, in code points; nothing past it is checked or emitted. */
  maxChars?: number;
  /** Checks in flight at once. */
  concurrency?: number;
}

const wordCount = (plain: string) => (plain === "" ? 0 : plain.split(" ").length);

/** A sentence as it is checked and shown: plain text, with personal data redacted. */
const shownText = (raw: string) => redactReply(plainText(raw));

/**
 * Releases a streaming reply one checked sentence at a time, in its final form. Text is buffered
 * until a sentence ends; each sentence is made plain text (no markdown or list markers, single
 * spaces), has personal data replaced by placeholders (`redactReply`: emails, phone numbers and the
 * like), and is checked, at most {@link CHECK_CONCURRENCY} at once and in order, and emitted in
 * order once its own check has passed, so checking the next sentence overlaps with emitting this
 * one. After a failed check nothing more is checked or emitted.
 *
 * The word and character caps are applied before any check: a reply that would run past either
 * ends after the last sentence that fits, or, when that keeps less than half of both caps, is cut
 * at the cap with an ellipsis, inside a word when a word or an unbroken string is too long. The
 * gate is then `full` and takes no more text. Sentences are joined by a space, or by nothing after
 * one that ended without whitespace, as Chinese and Japanese sentences do. What it emits, joined,
 * is always `text`: nothing emitted is ever cut later.
 */
export class SentenceGate {
  readonly #flagged: (sentence: string) => Promise<boolean>;
  readonly #emit: (text: string) => Promise<void>;
  readonly #maxWords: number;
  readonly #maxChars: number;
  readonly #concurrency: number;
  #pending = "";
  #text = "";
  #words = 0;
  #chars = 0;
  /** What goes before the next sentence: a space, or nothing after an end without whitespace. */
  #gap = "";
  #queue: Promise<void> = Promise.resolve();
  #sentences = 0;
  #full = false;
  #blocked = false;
  #stopped = false;
  #running = 0;
  readonly #waiting: (() => void)[] = [];

  /** `flagged` resolves true to withhold a sentence; `emit` delivers one that passed. */
  constructor(
    flagged: (sentence: string) => Promise<boolean>,
    emit: (text: string) => Promise<void>,
    {
      maxWords = LIMITS.replyMaxWords,
      maxChars = LIMITS.replyMaxChars,
      concurrency = CHECK_CONCURRENCY,
    }: GateOptions = {},
  ) {
    this.#flagged = flagged;
    this.#emit = emit;
    this.#maxWords = maxWords;
    this.#maxChars = maxChars;
    this.#concurrency = concurrency;
  }

  /**
   * Adds released text; every sentence it completes is sent for checking at once. An unfinished
   * sentence that already runs past a cap ends the reply here.
   */
  push(text: string): void {
    if (this.#full) return;
    this.#pending += text;
    let end = 0;
    for (const match of this.#pending.matchAll(SENTENCE_END)) {
      const stop = match.index + match[0].length;
      const room = this.#take(this.#pending.slice(end, stop));
      end = stop;
      if (!room) {
        this.#pending = "";
        return;
      }
    }
    this.#pending = this.#pending.slice(end);
    if (!this.#fits(shownText(this.#pending))) {
      this.#take(this.#pending);
      this.#pending = "";
    }
  }

  /**
   * Checks and emits the rest as the last sentence, then waits for every check and emit. Resolves
   * false when a sentence was withheld; rejects when a check or an emit threw.
   */
  async finish(): Promise<boolean> {
    this.#take(this.#pending);
    this.#pending = "";
    await this.#queue;
    return !this.#blocked;
  }

  /** Emits nothing more and waits for an emit already under way; errors no longer matter. */
  async stop(): Promise<void> {
    this.#stopped = true;
    await this.#queue.catch(() => undefined);
  }

  /** True once a check has withheld a sentence. */
  get blocked(): boolean {
    return this.#blocked;
  }

  /** True once a cap is reached: the reply ends with what was taken. */
  get full(): boolean {
    return this.#full;
  }

  /** How many sentences were sent for checking. */
  get sentences(): number {
    return this.#sentences;
  }

  /** Every sentence sent for checking, joined as they are emitted: the reply as it will be shown. */
  get text(): string {
    return this.#text;
  }

  /** True when `shown` can follow what was taken without passing either cap. */
  #fits(shown: string): boolean {
    if (shown === "") return true;
    const chars = countChars(this.#sentences === 0 ? shown : this.#gap + shown);
    return (
      this.#words + wordCount(shown) <= this.#maxWords && this.#chars + chars <= this.#maxChars
    );
  }

  /**
   * Takes a sentence within the caps; one that runs past either ends the reply, with the part the
   * caps allow when the reply would otherwise keep less than half of both. Returns false once full.
   */
  #take(raw: string): boolean {
    if (this.#full) return false;
    const shown = shownText(raw);
    if (this.#fits(shown)) {
      if (shown !== "") this.#enqueue(shown, /\s$/.test(raw));
      return true;
    }
    this.#full = true;
    // A sentence end in the first half of the caps would throw away most of the reply.
    if (this.#words >= this.#maxWords / 2 || this.#chars >= this.#maxChars / 2) return false;
    const gap = this.#sentences === 0 ? 0 : countChars(this.#gap);
    const room = this.#maxChars - this.#chars - gap - countChars(ELLIPSIS);
    let head = shown
      .split(" ")
      .slice(0, this.#maxWords - this.#words)
      .join(" ");
    if (countChars(head) > room) {
      head = Array.from(head).slice(0, room).join("").replace(CUT_PLACEHOLDER, "");
    }
    this.#enqueue(`${head.replace(CUT_END, "")}${ELLIPSIS}`, false);
    return false;
  }

  /** Queues a sentence for its check and emit; `spaced` when whitespace followed it. */
  #enqueue(sentence: string, spaced: boolean): void {
    const text = this.#sentences === 0 ? sentence : this.#gap + sentence;
    this.#gap = spaced ? " " : "";
    this.#sentences += 1;
    this.#words += wordCount(sentence);
    this.#chars += countChars(text);
    this.#text += text;
    const verdict = this.#check(sentence);
    // A check that settles after an earlier sentence was withheld is never awaited.
    verdict.catch(() => undefined);
    this.#queue = this.#queue.then(async () => {
      if (this.#halted()) return;
      const flagged = await verdict;
      // Checked again: the gate may have been stopped while this check ran.
      if (this.#halted()) return;
      if (flagged) this.#blocked = true;
      else await this.#emit(text);
    });
    // Handled here so an abandoned stream never leaves an unhandled rejection; finish() still sees it.
    this.#queue.catch(() => undefined);
  }

  /**
   * Runs one check once a slot is free; slots pass to waiting checks in order. A flagged sentence
   * halts the gate at once, since the reply will not be shown, and a check whose turn comes after
   * that is never made (it reads as withheld; nothing awaits it).
   */
  async #check(sentence: string): Promise<boolean> {
    if (this.#running < this.#concurrency) this.#running += 1;
    else await new Promise<void>((resolve) => this.#waiting.push(resolve));
    try {
      if (this.#halted()) return true;
      const flagged = await this.#flagged(sentence);
      if (flagged) this.#blocked = true;
      return flagged;
    } finally {
      const next = this.#waiting.shift();
      if (next) next();
      else this.#running -= 1;
    }
  }

  #halted(): boolean {
    return this.#blocked || this.#stopped;
  }
}
