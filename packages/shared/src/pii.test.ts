import { describe, expect, it } from "vitest";
import { redactPii } from "./pii.js";

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
