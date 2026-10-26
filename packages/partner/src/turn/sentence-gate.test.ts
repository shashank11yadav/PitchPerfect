import { LIMITS } from "@pitchperfect/shared";
import { VOICES } from "@pitchperfect/scripted-partner";
import { describe, expect, it } from "vitest";
import { plainText } from "../guardrails/output.js";
import { SentenceGate, type GateOptions } from "./sentence-gate.js";

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
    expect(emitted).toEqual(["Thanks for calling.", " How is dispatch going?"]);
    expect(await gate.finish()).toBe(true);
    expect(emitted).toEqual(["Thanks for calling.", " How is dispatch going?", " Busy"]);
    expect(gate.text).toBe(emitted.join(""));
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
    expect(emitted).toEqual(["First one."]);
    expect(checked).toEqual(["First one.", "Second one."]);
    emitting.resolve();
    await gate.finish();
    expect(emitted).toEqual(["First one.", " Second one."]);
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
    expect(emitted).toEqual(["Slow check here.", " Fast check here."]);
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
    expect(emitted.join("")).not.toMatch(/bad|end/);
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

  it("checks and emits each sentence as plain text, without markdown or list markers", async () => {
    const { gate, emitted, checked } = collecting();
    gate.push("**Sure.** Here is the plan:\n- First we talk.\n- Then we sign. ");
    gate.push("1. Last, `pricing`.");
    await gate.finish();
    expect(checked).toEqual([
      "Sure. Here is the plan: First we talk.",
      "Then we sign.",
      "Last, pricing.",
    ]);
    expect(emitted.join("")).toBe(
      "Sure. Here is the plan: First we talk. Then we sign. Last, pricing.",
    );
    expect(gate.text).toBe(emitted.join(""));
  });

  it("ends the reply at the last sentence within the cap, and checks nothing past it", async () => {
    const { gate, emitted, checked } = collecting({ maxWords: 80 });
    gate.push(`${sentence(40, "a")} ${sentence(30, "b")} `);
    expect(gate.full).toBe(false);
    gate.push(`${sentence(30, "c")} ${sentence(5, "d")} `);
    expect(gate.full).toBe(true);
    gate.push(sentence(5, "e"));
    await gate.finish();
    expect(emitted.join("")).toBe(`${sentence(40, "a")} ${sentence(30, "b")}`);
    expect(checked.join(" ")).not.toMatch(/[cde]0/);
  });

  it("knows the cap is passed before the sentence that passes it ends", async () => {
    const { gate, emitted } = collecting({ maxWords: 80 });
    gate.push(`${sentence(50, "a")} ${sentence(40, "b").slice(0, -1)}`);
    expect(gate.full).toBe(true);
    await gate.finish();
    expect(emitted.join("")).toBe(sentence(50, "a"));
  });

  it("cuts at the cap with an ellipsis when the last sentence end keeps under half of it", async () => {
    const { gate, emitted } = collecting({ maxWords: 80 });
    gate.push(`Sure. ${sentence(90, "w")}`);
    await gate.finish();
    const text = emitted.join("");
    expect(text.endsWith("…")).toBe(true);
    expect(text.split(" ")).toHaveLength(80);
    expect(gate.text).toBe(text);
  });

  it("does not treat an abbreviation as a usable sentence end", async () => {
    const { gate, emitted } = collecting({ maxWords: 80 });
    gate.push(`We met Dr. Smith ${sentence(90, "w")}`);
    await gate.finish();
    expect(emitted.join("")).toMatch(/^We met Dr\. Smith .*…$/);
  });

  it("ends sentences at Chinese and Japanese punctuation with no space after it", async () => {
    const { gate, emitted } = collecting();
    gate.push("您好，我是王经理。我们每天");
    await tick();
    expect(emitted).toEqual(["您好，我是王经理。"]);
    gate.push("配送两百单！真的吗？はい、そうです。");
    await tick();
    expect(emitted).toEqual([
      "您好，我是王经理。",
      "我们每天配送两百单！",
      "真的吗？",
      "はい、そうです。",
    ]);
    gate.push("「それで？」と聞きました．");
    await gate.finish();
    expect(emitted.slice(4)).toEqual(["「それで？」", "と聞きました．"]);
    expect(gate.text).toBe(emitted.join(""));
    expect(gate.text).toBe(
      "您好，我是王经理。我们每天配送两百单！真的吗？はい、そうです。「それで？」と聞きました．",
    );
  });

  it("ends sentences at a Devanagari danda and an Arabic question mark", async () => {
    const { gate, emitted } = collecting();
    gate.push("यह बहुत अच्छा है। अब बताइए");
    await tick();
    expect(emitted).toEqual(["यह बहुत अच्छा है।"]);
    gate.push("॥ هل لديك وقت؟ نعم");
    await tick();
    expect(emitted).toEqual(["यह बहुत अच्छा है।", " अब बताइए॥", " هل لديك وقت؟"]);
    await gate.finish();
    expect(gate.text).toBe("यह बहुत अच्छा है। अब बताइए॥ هل لديك وقت؟ نعم");
  });

  it("keeps a reply within the character cap, ending at a sentence that fits", async () => {
    const { gate, emitted, checked } = collecting({ maxChars: 100 });
    const first = `${"x".repeat(60)}.`;
    gate.push(`${first} ${"y".repeat(50)}. More after the cap. `);
    expect(gate.full).toBe(true);
    await gate.finish();
    expect(emitted.join("")).toBe(first);
    expect(checked).toEqual([first]);
  });

  it("cuts a long unbroken string at the character cap, before any check", async () => {
    const { gate, emitted, checked } = collecting({ maxChars: 100 });
    gate.push(`Sure. ${"z".repeat(500)}`);
    // The cap is known before the string ends, so the stream can stop here.
    expect(gate.full).toBe(true);
    await gate.finish();
    const text = emitted.join("");
    expect(Array.from(text)).toHaveLength(100);
    expect(text).toMatch(/^Sure\. z+…$/);
    expect(checked.join(" ")).not.toMatch(/z{100}/);
    expect(gate.text).toBe(text);
  });

  it("applies the default 600-character cap to a reply of very long words", async () => {
    const { gate, emitted } = collecting();
    const words = Array.from({ length: 40 }, (_, i) => `${"w".repeat(30)}${String(i)}`);
    gate.push(`${words.join(" ")}.`);
    await gate.finish();
    const text = emitted.join("");
    expect(Array.from(text).length).toBeLessThanOrEqual(LIMITS.replyMaxChars);
    expect(text.endsWith("…")).toBe(true);
  });

  it("redacts personal data before a sentence is checked or emitted", async () => {
    const { gate, emitted, checked } = collecting();
    gate.push("Sure, call me on 617 555 0100 tomorrow. ");
    gate.push("Or write to jane dot doe at gmail dot com. ");
    gate.push("Thanks.");
    await gate.finish();
    const text = emitted.join("");
    expect(text).toBe("Sure, call me on [phone] tomorrow. Or write to [email]. Thanks.");
    expect(checked.join(" ")).not.toMatch(/617|gmail/);
    expect(gate.text).toBe(text);
  });

  it("keeps full-width punctuation in a sentence with nothing to redact", async () => {
    const { gate, emitted } = collecting();
    gate.push("好的！请问价格是多少？");
    await gate.finish();
    expect(emitted).toEqual(["好的！", "请问价格是多少？"]);
  });

  it("leaves every line the scripted partner can say unchanged", async () => {
    const lines: string[] = [];
    const collect = (value: unknown): void => {
      if (typeof value === "string") lines.push(value.replaceAll("%", ", Chris"));
      else if (Array.isArray(value)) value.forEach(collect);
      else if (typeof value === "object" && value !== null) Object.values(value).forEach(collect);
    };
    collect(VOICES);
    expect(lines.length).toBeGreaterThan(200);
    for (const line of lines) {
      const { gate } = collecting();
      gate.push(line);
      await gate.finish();
      expect(gate.text, line).toBe(plainText(line));
    }
  });

  it("checks at most two sentences at a time, in order", async () => {
    let running = 0;
    let most = 0;
    const started: string[] = [];
    const gate = new SentenceGate(
      async (sentence) => {
        started.push(sentence);
        running += 1;
        most = Math.max(most, running);
        await tick();
        running -= 1;
        return false;
      },
      () => Promise.resolve(),
    );
    const sentences = Array.from({ length: 12 }, (_, i) => `Sentence s${String(i)}.`);
    gate.push(`${sentences.join(" ")} `);
    expect(await gate.finish()).toBe(true);
    expect(most).toBe(2);
    expect(started).toEqual(sentences);
  });

  it("starts no check once a sentence was withheld", async () => {
    const started: string[] = [];
    const gate = new SentenceGate(
      async (sentence) => {
        started.push(sentence);
        await tick();
        return true;
      },
      () => Promise.resolve(),
    );
    gate.push(`${Array.from({ length: 12 }, (_, i) => `Sentence s${String(i)}.`).join(" ")} `);
    expect(await gate.finish()).toBe(false);
    expect(started).toEqual(["Sentence s0.", "Sentence s1."]);
  });
});

const sentence = (n: number, word: string) =>
  `${Array.from({ length: n }, (_, i) => `${word}${String(i)}`).join(" ")}.`;

/** A gate that passes every check, with what it checked and emitted. */
function collecting(options?: GateOptions) {
  const checked: string[] = [];
  const emitted: string[] = [];
  const gate = new SentenceGate(
    (text) => {
      checked.push(text);
      return Promise.resolve(false);
    },
    (text) => {
      emitted.push(text);
      return Promise.resolve();
    },
    options,
  );
  return { gate, checked, emitted };
}
