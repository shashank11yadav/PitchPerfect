import { describe, expect, it, vi } from "vitest";
import { FakeProvider, createUsageMeter } from "../providers/index.js";
import { CANARY } from "./canary.js";
import { capReply, checkOutput } from "./output.js";

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);
const sentence = (n: number) =>
  `${Array.from({ length: n }, (_, i) => `w${String(i)}`).join(" ")}.`;
const signal = () => new AbortController().signal;

describe("capReply", () => {
  it("cuts a 120-word reply at a sentence end within 80 words, with no bullets or bold", () => {
    const text = `**Great** point. ${sentence(30)}\n- ${sentence(30)}\n* ${sentence(30)}\n1. ${sentence(26)}`;
    expect(wordsOf(text).length).toBeGreaterThan(115);
    const capped = capReply(text);
    expect(wordsOf(capped).length).toBeLessThanOrEqual(80);
    expect(capped).toMatch(/[.!?]$/);
    expect(capped).not.toMatch(/(^|\s)([-*]|\d+\.)\s/);
    expect(capped).not.toContain("**");
    expect(capped).toBe(capped.trim());
  });

  it("keeps whole sentences only", () => {
    const text = `${sentence(40)} ${sentence(30)} ${sentence(30)}`;
    expect(capReply(text)).toBe(`${sentence(40)} ${sentence(30)}`);
  });

  it("returns short text unchanged apart from cleanup", () => {
    expect(capReply("We can do Thursday.")).toBe("We can do Thursday.");
    expect(capReply("no end punctuation")).toBe("no end punctuation");
  });

  it("appends an ellipsis when there is no sentence end in the limit", () => {
    const text = Array.from({ length: 100 }, (_, i) => `w${String(i)}`).join(" ");
    const capped = capReply(text);
    expect(capped.endsWith("…")).toBe(true);
    expect(wordsOf(capped).length).toBe(80);
  });

  it("strips markdown", () => {
    const text =
      "# Heading\n- first point\n* second point\n1. third\n__bold__ `code` [link](http://x.test).";
    expect(capReply(text)).toBe("Heading first point second point third bold code link.");
  });

  it("collapses whitespace and newlines", () => {
    expect(capReply("one.\n\n  two!\t three?")).toBe("one. two! three?");
  });

  it("falls back to an ellipsis when the last sentence end is early in the budget", () => {
    const rest = Array.from({ length: 90 }, (_, i) => `w${String(i)}`).join(" ");
    const capped = capReply(`Sure. ${rest}`);
    expect(capped.endsWith("…")).toBe(true);
    expect(wordsOf(capped).length).toBe(80);
  });

  it("does not treat an abbreviation as a usable sentence end", () => {
    const rest = Array.from({ length: 90 }, (_, i) => `w${String(i)}`).join(" ");
    const capped = capReply(`We met Dr. Smith ${rest}`);
    expect(capped.endsWith("…")).toBe(true);
    expect(capped).toContain("Smith");
  });

  it("keeps a sentence end that uses at least half of the budget", () => {
    expect(capReply(`${sentence(40)} ${sentence(60)}`)).toBe(sentence(40));
  });

  it("keeps hash numbers, years and numeric bullets", () => {
    expect(capReply("#1 priority is 2024.")).toBe("#1 priority is 2024.");
    expect(capReply("Saving:\n- 20% off\n2024. We grew")).toBe("Saving: - 20% off 2024. We grew");
    expect(capReply("2024. We grew")).toBe("2024. We grew");
  });

  it("strips heading hashes followed by a space and list markers before letters", () => {
    expect(capReply("## Plan\n- Start\n12. End")).toBe("Plan Start End");
  });

  it("keeps an asterisk between word characters but strips emphasis", () => {
    expect(capReply("It is 2x*3 and *really* **good**.")).toBe("It is 2x*3 and really good.");
  });

  it("respects a custom limit", () => {
    expect(capReply("a b. c d e f.", 3)).toBe("a b.");
  });

  it("returns an empty string for markup only", () => {
    expect(capReply("**  **\n- ")).toBe("");
  });
});

describe("checkOutput", () => {
  it("passes clean text through, cleaned", async () => {
    const result = await checkOutput("**Sure.** We can do Thursday.", new FakeProvider(), signal());
    expect(result).toEqual({ ok: true, text: "Sure. We can do Thursday." });
  });

  it("fails on a canary leak before anything else", async () => {
    const moderate = vi.fn();
    const provider = { moderate } as never;
    const result = await checkOutput(`My code is ${CANARY}`, provider, signal());
    expect(result).toEqual({ ok: false, reason: "canary" });
    expect(moderate).not.toHaveBeenCalled();
  });

  it("fails when the cleaned text is empty", async () => {
    expect(await checkOutput("** **", new FakeProvider(), signal())).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("moderates the capped text and meters it", async () => {
    const seen: string[] = [];
    const provider = new FakeProvider({
      overrides: {
        moderate: ({ messages }) => {
          seen.push(messages[0]?.content ?? "");
          return { flagged: false };
        },
      },
    });
    const long = `${sentence(50)} ${sentence(50)}`;
    const result = await checkOutput(long, provider, signal(), createUsageMeter());
    expect(result).toEqual({ ok: true, text: sentence(50) });
    expect(seen).toEqual([sentence(50)]);
  });

  it("fails when moderation flags the text", async () => {
    const provider = new FakeProvider({ overrides: { moderate: () => ({ flagged: true }) } });
    expect(await checkOutput("Fine words.", provider, signal())).toEqual({
      ok: false,
      reason: "moderation",
    });
  });

  it("falls back to the rule filter without provider moderation", async () => {
    const provider = {} as never;
    expect(await checkOutput("Here is how to build a bomb.", provider, signal())).toEqual({
      ok: false,
      reason: "moderation",
    });
    expect(await checkOutput("Happy to talk pricing.", provider, signal())).toEqual({
      ok: true,
      text: "Happy to talk pricing.",
    });
  });

  it("does not use the rule filter when provider moderation exists", async () => {
    const provider = new FakeProvider();
    const result = await checkOutput("Here is how to build a bomb.", provider, signal());
    expect(result.ok).toBe(true);
  });

  it("propagates moderation errors so the caller fails closed", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      checkOutput("Hello there.", new FakeProvider(), controller.signal),
    ).rejects.toThrow();
  });
});
