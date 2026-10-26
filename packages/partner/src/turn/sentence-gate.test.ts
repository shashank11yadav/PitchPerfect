import { describe, expect, it } from "vitest";
import { SentenceGate } from "./sentence-gate.js";

/** A promise with its resolve function, to hold a check or an emit open. */
function deferred<T = void>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("SentenceGate", () => {
  it("emits nothing until a sentence ends, then whole sentences in order", async () => {
    const emitted: string[] = [];
    const gate = new SentenceGate(
      () => Promise.resolve(false),
      (text) => {
        emitted.push(text);
        return Promise.resolve();
      },
    );
    gate.push("Thanks for");
    await tick();
    expect(emitted).toEqual([]);
    gate.push(" calling. How is");
    gate.push(" dispatch going? Busy");
    await tick();
    expect(emitted).toEqual(["Thanks for calling. ", "How is dispatch going? "]);
    expect(await gate.finish()).toBe(true);
    expect(emitted).toEqual(["Thanks for calling. ", "How is dispatch going? ", "Busy"]);
    expect(gate.sentences).toBe(3);
  });

  it("checks the next sentence while the current one is still being emitted", async () => {
    const checked: string[] = [];
    const emitting = deferred();
    const emitted: string[] = [];
    const gate = new SentenceGate(
      (sentence) => {
        checked.push(sentence);
        return Promise.resolve(false);
      },
      async (text) => {
        emitted.push(text);
        if (emitted.length === 1) await emitting.promise;
      },
    );
    gate.push("First one. ");
    await tick();
    gate.push("Second one. ");
    await tick();
    // The first emit is still open, and the second sentence has already been checked.
    expect(emitted).toEqual(["First one. "]);
    expect(checked).toEqual(["First one.", "Second one."]);
    emitting.resolve();
    await gate.finish();
    expect(emitted).toEqual(["First one. ", "Second one. "]);
  });

  it("keeps the order when a later sentence's check finishes first", async () => {
    const slow = deferred<boolean>();
    const emitted: string[] = [];
    const gate = new SentenceGate(
      (sentence) => (sentence.startsWith("Slow") ? slow.promise : Promise.resolve(false)),
      (text) => {
        emitted.push(text);
        return Promise.resolve();
      },
    );
    gate.push("Slow check here. Fast check here. ");
    await tick();
    expect(emitted).toEqual([]);
    slow.resolve(false);
    await gate.finish();
    expect(emitted).toEqual(["Slow check here. ", "Fast check here. "]);
  });

  it("emits nothing after a withheld sentence", async () => {
    const emitted: string[] = [];
    const gate = new SentenceGate(
      (sentence) => Promise.resolve(sentence.includes("bad")),
      (text) => {
        emitted.push(text);
        return Promise.resolve();
      },
    );
    gate.push("Fine start. A bad middle. A fine end. ");
    expect(await gate.finish()).toBe(false);
    expect(gate.blocked).toBe(true);
    expect(emitted).toEqual(["Fine start. "]);
  });

  it("emits nothing more once stopped", async () => {
    const check = deferred<boolean>();
    const emitted: string[] = [];
    const gate = new SentenceGate(
      () => check.promise,
      (text) => {
        emitted.push(text);
        return Promise.resolve();
      },
    );
    gate.push("Waiting on this one. ");
    const stopped = gate.stop();
    check.resolve(false);
    await stopped;
    expect(emitted).toEqual([]);
  });

  it("passes a failed check on to finish()", async () => {
    const gate = new SentenceGate(
      () => Promise.reject(new Error("check failed")),
      () => Promise.resolve(),
    );
    gate.push("Anything at all. ");
    await expect(gate.finish()).rejects.toThrow("check failed");
  });
});
