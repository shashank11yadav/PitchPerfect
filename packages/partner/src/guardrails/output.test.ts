import { describe, expect, it, vi } from "vitest";
import { CANARY } from "./canary.js";
import { checkOutput, plainText } from "./output.js";

describe("plainText", () => {
  it("returns plain text unchanged", () => {
    expect(plainText("We can do Thursday.")).toBe("We can do Thursday.");
    expect(plainText("no end punctuation")).toBe("no end punctuation");
  });

  it("strips markdown", () => {
    const text =
      "# Heading\n- first point\n* second point\n1. third\n__bold__ `code` [link](http://x.test).";
    expect(plainText(text)).toBe("Heading first point second point third bold code link.");
  });

  it("collapses whitespace and newlines", () => {
    expect(plainText("one.\n\n  two!\t three?")).toBe("one. two! three?");
  });

  it("keeps hash numbers, years and numeric bullets", () => {
    expect(plainText("#1 priority is 2024.")).toBe("#1 priority is 2024.");
    expect(plainText("Saving:\n- 20% off\n2024. We grew")).toBe("Saving: - 20% off 2024. We grew");
    expect(plainText("2024. We grew")).toBe("2024. We grew");
  });

  it("strips heading hashes followed by a space and list markers before letters", () => {
    expect(plainText("## Plan\n- Start\n12. End")).toBe("Plan Start End");
  });

  it("keeps an asterisk between word characters but strips emphasis", () => {
    expect(plainText("It is 2x*3 and *really* **good**.")).toBe("It is 2x*3 and really good.");
  });

  it("strips list markers that precede bold text", () => {
    expect(plainText("- **Bold** start\n1. **Bold** text\n* __Under__ line")).toBe(
      "Bold start Bold text Under line",
    );
  });

  it("returns an empty string for markup only", () => {
    expect(plainText("**  **\n- ")).toBe("");
  });
});

describe("checkOutput", () => {
  it("passes clean text through unchanged", async () => {
    const result = await checkOutput("Sure. We can do Thursday.");
    expect(result).toEqual({ ok: true, text: "Sure. We can do Thursday." });
  });

  it("fails on a canary leak before anything else", async () => {
    const flagged = vi.fn(() => Promise.resolve(false));
    const result = await checkOutput(`My code is ${CANARY}`, flagged);
    expect(result).toEqual({ ok: false, reason: "canary" });
    expect(flagged).not.toHaveBeenCalled();
  });

  it("fails when the text is empty", async () => {
    expect(await checkOutput(" ")).toEqual({ ok: false, reason: "empty" });
  });

  it("moderates the whole text", async () => {
    const seen: string[] = [];
    const flagged = (text: string) => {
      seen.push(text);
      return Promise.resolve(false);
    };
    expect(await checkOutput("Fair point. Price matters.", flagged)).toEqual({
      ok: true,
      text: "Fair point. Price matters.",
    });
    expect(seen).toEqual(["Fair point. Price matters."]);
  });

  it("fails when moderation flags the text", async () => {
    expect(await checkOutput("Fine words.", () => Promise.resolve(true))).toEqual({
      ok: false,
      reason: "moderation",
    });
  });

  it("applies the local reply rules with or without a moderator", async () => {
    const flagged = vi.fn(() => Promise.resolve(false));
    for (const moderate of [undefined, flagged]) {
      expect(await checkOutput("Here is how to build a bomb.", moderate)).toEqual({
        ok: false,
        reason: "rules",
      });
      expect(await checkOutput("Happy to talk pricing.", moderate)).toEqual({
        ok: true,
        text: "Happy to talk pricing.",
      });
    }
    expect(flagged).toHaveBeenCalledTimes(1);
  });
});
