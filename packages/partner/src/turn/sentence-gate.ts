/** A sentence end: terminal punctuation, any closing quotes or brackets, then whitespace. */
const SENTENCE_END = /[.!?…]+["')\]”’]*\s+/g;

/**
 * Releases a streaming reply one checked sentence at a time. Text is buffered until a sentence
 * ends; each sentence's check starts as soon as the sentence is complete, and sentences are
 * emitted in order once their own check has passed, so checking the next sentence overlaps with
 * emitting this one. After a failed check nothing more is emitted.
 */
export class SentenceGate {
  readonly #flagged: (sentence: string) => Promise<boolean>;
  readonly #emit: (text: string) => Promise<void>;
  #pending = "";
  #queue: Promise<void> = Promise.resolve();
  #sentences = 0;
  #blocked = false;
  #stopped = false;

  /** `flagged` resolves true to withhold a sentence; `emit` delivers one that passed. */
  constructor(
    flagged: (sentence: string) => Promise<boolean>,
    emit: (text: string) => Promise<void>,
  ) {
    this.#flagged = flagged;
    this.#emit = emit;
  }

  /** Adds released text; every sentence it completes is sent for checking at once. */
  push(text: string): void {
    this.#pending += text;
    let end = 0;
    for (const match of this.#pending.matchAll(SENTENCE_END)) {
      const stop = match.index + match[0].length;
      this.#enqueue(this.#pending.slice(end, stop));
      end = stop;
    }
    this.#pending = this.#pending.slice(end);
  }

  /**
   * Checks and emits the rest as the last sentence, then waits for every check and emit. Resolves
   * false when a sentence was withheld; rejects when a check or an emit threw.
   */
  async finish(): Promise<boolean> {
    if (this.#pending.trim() !== "") this.#enqueue(this.#pending);
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

  /** How many sentences were sent for checking. */
  get sentences(): number {
    return this.#sentences;
  }

  #enqueue(sentence: string): void {
    if (sentence.trim() === "") return;
    this.#sentences += 1;
    const verdict = this.#flagged(sentence.trim());
    // A check that settles after an earlier sentence was withheld is never awaited.
    verdict.catch(() => undefined);
    this.#queue = this.#queue.then(async () => {
      if (this.#halted()) return;
      const flagged = await verdict;
      // Checked again: the gate may have been stopped while this check ran.
      if (this.#halted()) return;
      if (flagged) this.#blocked = true;
      else await this.#emit(sentence);
    });
    // Handled here so an abandoned stream never leaves an unhandled rejection; finish() still sees it.
    this.#queue.catch(() => undefined);
  }

  #halted(): boolean {
    return this.#blocked || this.#stopped;
  }
}
