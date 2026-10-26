import { LIMITS } from "@pitchperfect/shared";
import { plainText } from "../guardrails/output.js";

/** A sentence end: terminal punctuation, any closing quotes or brackets, then whitespace. */
const SENTENCE_END = /[.!?…]+["')\]”’]*\s+/g;
/** What a cut in the middle of a sentence drops from its end before the ellipsis. */
const CUT_END = /[\s,;:–-]+$/;

/** Checks one reply may have in flight at once. */
const CHECK_CONCURRENCY = 2;

export interface GateOptions {
  /** The reply's word cap; nothing past it is checked or emitted. */
  maxWords?: number;
  /** Checks in flight at once. */
  concurrency?: number;
}

const wordCount = (plain: string) => (plain === "" ? 0 : plain.split(" ").length);

/**
 * Releases a streaming reply one checked sentence at a time, in its final form. Text is buffered
 * until a sentence ends; each sentence is made plain text (no markdown or list markers, single
 * spaces) and checked, at most {@link CHECK_CONCURRENCY} at once and in order, and emitted in order
 * once its own check has passed, so checking the next sentence overlaps with emitting this one.
 * After a failed check nothing more is checked or emitted.
 *
 * The word cap is applied before any check: a reply that would run past it ends after the last
 * sentence that fits, or, when that keeps less than half the cap, is cut at the cap with an
 * ellipsis. The gate is then `full` and takes no more text. What it emits, joined, is always
 * `text`: nothing emitted is ever cut later.
 */
export class SentenceGate {
  readonly #flagged: (sentence: string) => Promise<boolean>;
  readonly #emit: (text: string) => Promise<void>;
  readonly #maxWords: number;
  readonly #concurrency: number;
  #pending = "";
  #text = "";
  #words = 0;
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
    { maxWords = LIMITS.replyMaxWords, concurrency = CHECK_CONCURRENCY }: GateOptions = {},
  ) {
    this.#flagged = flagged;
    this.#emit = emit;
    this.#maxWords = maxWords;
    this.#concurrency = concurrency;
  }

  /**
   * Adds released text; every sentence it completes is sent for checking at once. An unfinished
   * sentence that already runs past the cap ends the reply here.
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
    if (this.#words + wordCount(plainText(this.#pending)) > this.#maxWords) {
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

  /** True once the word cap is reached: the reply ends with what was taken. */
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

  /**
   * Takes a sentence within the cap; one that runs past it ends the reply, with the part the cap
   * allows when the reply would otherwise keep less than half of it. Returns false once full.
   */
  #take(raw: string): boolean {
    if (this.#full) return false;
    const plain = plainText(raw);
    const words = wordCount(plain);
    const room = this.#maxWords - this.#words;
    if (words <= room) {
      this.#words += words;
      if (words > 0) this.#enqueue(plain);
      return true;
    }
    this.#full = true;
    // A sentence end in the first half of the cap would throw away most of the reply.
    if (this.#words >= this.#maxWords / 2) return false;
    const head = plain.split(" ").slice(0, room).join(" ").replace(CUT_END, "");
    this.#words = this.#maxWords;
    this.#enqueue(`${head}…`);
    return false;
  }

  #enqueue(sentence: string): void {
    const text = this.#sentences === 0 ? sentence : ` ${sentence}`;
    this.#sentences += 1;
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
