import { describe, expect, it } from "vitest";
import { LIMITS } from "./limits.js";
import { redactPii, redactTurn } from "./pii.js";
import { countChars } from "./text.js";

describe("redactPii", () => {
  it("redacts emails", () => {
    expect(redactPii("mail me at a.b+c@x.io")).toBe("mail me at [email]");
  });

  it("redacts phone numbers in common formats", () => {
    expect(redactPii("call (617) 555-0100 or +1 617 555 0100")).toBe("call [phone] or [phone]");
    expect(redactPii("617.555.0100")).toBe("[phone]");
    expect(redactPii("6175550100")).toBe("[phone]");
  });

  it("redacts Luhn-valid card numbers", () => {
    expect(redactPii("card 4111 1111 1111 1111")).toBe("card [number]");
    expect(redactPii("card 4111-1111-1111-1111.")).toBe("card [number].");
    expect(redactPii("card 4111111111111111")).toBe("card [number]");
  });

  it("redacts cards wrapped in punctuation or with irregular spacing", () => {
    expect(redactPii("(4111 1111 1111 1111)")).toBe("([number])");
    expect(redactPii("card +4111 1111 1111 1111")).toBe("card +[number]");
    expect(redactPii("4111  1111  1111  1111")).toBe("[number]");
    expect(redactPii("4111- 1111 -1111- 1111")).toBe("[number]");
  });

  it("does not treat dates, times, or year ranges as phone numbers", () => {
    for (const text of [
      "2026-10-19",
      "2026-10-19 14:30",
      "at 2026-10-19 09:00:00 UTC",
      "2026-10-19T09:00:00Z",
      "2026-10-19T09:00:00.123+02:00",
      "10/19/2026",
      "meet at 14:30 or 9:05",
      "FY 2024-2026 2027 2028",
      "2024-2026",
    ]) {
      expect(redactPii(text), text).toBe(text);
    }
  });

  it("still redacts a phone number next to a date", () => {
    expect(redactPii("on 2026-10-19 call 617 555 0100")).toBe("on 2026-10-19 call [phone]");
  });

  it("leaves long digit runs that fail the Luhn check alone", () => {
    expect(redactPii("order 4111 1111 1111 1112")).toBe("order 4111 1111 1111 1112");
    expect(redactPii("id 12345678901234567890")).toBe("id 12345678901234567890");
  });

  it("keeps ordinary numbers, symbols, and unicode", () => {
    const text = "Founded in 2026, $45,000 budget, zip 02110, 30% off 😀 café";
    expect(redactPii(text)).toBe(text);
  });

  it("redacts several items in one message", () => {
    expect(redactPii("me@x.io, 617 555 0100, 4111 1111 1111 1111")).toBe(
      "[email], [phone], [number]",
    );
  });

  it("is idempotent", () => {
    const once = redactPii("me@x.io 617 555 0100");
    expect(redactPii(once)).toBe(once);
  });

  it("stays fast on long adversarial input", () => {
    const start = Date.now();
    redactPii("a".repeat(100_000));
    redactPii("1 ".repeat(50_000));
    redactPii("a.".repeat(50_000) + "@");
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe("redactTurn", () => {
  it("normalizes and redacts personal data", () => {
    expect(redactTurn("  Call  me at 617-555-0100\u0000 or a.b@example.test ")).toBe(
      "Call me at [phone] or [email]",
    );
  });

  it("redacts what invisible characters were hiding", () => {
    expect(redactTurn("call 617\u200b555\u200b0100")).toBe("call [phone]");
    expect(redactTurn("a.b\u200b@example.test")).toBe("[email]");
  });

  it("keeps a placeholder that fits within the limit", () => {
    const text = `${"z".repeat(990)} a@b.co`;
    expect(redactTurn(text)).toBe(`${"z".repeat(990)} [email]`);
  });

  it("drops a placeholder that redaction pushed past the limit instead of cutting it", () => {
    // 1000 characters; "[email]" is one character longer than "a@b.co".
    const text = `${"z".repeat(LIMITS.turnMaxChars - 7)} a@b.co`;
    expect(countChars(text)).toBe(LIMITS.turnMaxChars);
    expect(redactTurn(text)).toBe("z".repeat(LIMITS.turnMaxChars - 7));
  });
});
