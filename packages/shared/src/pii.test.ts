import { describe, expect, it } from "vitest";
import { LIMITS } from "./limits.js";
import { redactPii, redactReply, redactTurn } from "./pii.js";
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

  // Personal data as people really type it: each one must come out redacted.
  it.each([
    ["SSN 123-45-6789", "SSN [ssn]"],
    ["my social is 123 45 6789", "my social is [ssn]"],
    ["ssn: 123456789", "ssn: [ssn]"],
    [
      "Social Security number 123456789, if you need it",
      "Social Security number [ssn], if you need it",
    ],
    ["It's 123-45-6789.", "It's [ssn]."],
    ["IBAN DE89 3704 0044 0532 0130 00", "IBAN [iban]"],
    ["pay GB82WEST12345698765432 today", "pay [iban] today"],
    ["iban: gb82 west 1234 5698 7654 32", "iban: [iban]"],
    ["FR14 2004 1010 0505 0001 3M02 606 is ours", "[iban] is ours"],
    ["NL91 ABNA 0417 1643 00 for the deposit", "[iban] for the deposit"],
    ["call ６１７５５５０１００", "call [phone]"],
    ["（６１７）５５５－０１００", "[phone]"],
    ["text ٦١٧٥٥٥٠١٠٠", "text [phone]"],
    ["mobile ６１７ ５５５ ０１００ after 5", "mobile [phone] after 5"],
    ["ssn １２３－４５－６７８９", "ssn [ssn]"],
    ["ｍｅ＠ｅｘａｍｐｌｅ．ｔｅｓｔ", "[email]"],
    ["+44 7700 900123", "[phone]"],
    ["+447700900123", "[phone]"],
    ["617–555–0100", "[phone]"],
    ["my cell is 6175550100", "my cell is [phone]"],
    ["6175550100", "[phone]"],
    ["card 4111.1111.1111.1111", "card [number]"],
    ["4111.1111.1111.1111, exp 04/29", "[number], exp 04/29"],
    ["amex 3782.822463.10005", "amex [number]"],
    ["my social is 123456789", "my social is [ssn]"],
    ["123456789 is my social", "[ssn] is my social"],
    ["123456789 (my SSN)", "[ssn] (my SSN)"],
    ["my soc sec is 123456789", "my soc sec is [ssn]"],
    ["SS number 123456789", "SS number [ssn]"],
    [
      "my social security number for the tax form is 123456789",
      "my social security number for the tax form is [ssn]",
    ],
    ["my tax id is 912345678", "my tax id is [ssn]"],
    ["my social is 987654321", "my social is [ssn]"],
    ["jane dot doe at gmail dot com", "[email]"],
    ["write to Jane Dot Doe AT Example DOT Test today", "write to [email] today"],
    ["jane(at)gmail(dot)com", "[email]"],
    ["jane [at] gmail", "[email]"],
    ["reach me: j.doe {at} example [dot] test", "reach me: [email]"],
    ["jane <at> gmail.com, thanks", "[email], thanks"],
    ["email me at jane at gmail dot com", "email me at [email]"],
    ["jane at gmail.com", "[email]"],
    ["jane @ gmail dot com", "[email]"],
    ["sam_ops at routewise dot co dot uk", "[email]"],
  ])("redacts %j", (text, expected) => {
    expect(redactPii(text)).toBe(expected);
  });

  // Numbers a sales call is full of: none of them is personal data.
  it.each([
    "1234567890 events",
    "We process 2500000000 events a month.",
    "That's 1500000000 impressions in Q3.",
    "1 234 567 890 users across Europe",
    "1.234.567.890 rows",
    "Revenue hit $1234567890 last year.",
    "€ 2500000000 under management",
    "order #1234567890",
    "Invoice 4500012345 is overdue.",
    "PO number 4500012345",
    "tracking 1234567890123",
    "ISBN 9780306406157",
    "We have 123456789 rows in the warehouse.",
    "000-12-3456",
    "666-12-3456",
    "900-12-3456",
    "123-00-4567",
    "DE89 3704 0044 0532 0130 01",
    "FY 2024–2026 2027 2028",
    "Ask about plan GB12 when you renew.",
    "zip 02110, ext 1234, 3 users",
    "192.168.1.10",
    "the gateway is 203.0.113.254",
    "text me if 198.51.100.200 goes down",
    "servers 10.0.0.1 and 172.16.254.100:8080",
    "3.14159",
    "pi is 3.141592653589",
    "$1,299.99",
    "$12345678.99 in pipeline",
    "12.5%",
    "churn fell from 0.0123456789 to 0.02",
    "4111.1111.1111.1112",
    "Our social media reach is 123456789 people",
    "social media budget: 123456789",
    "On social we have 123456789 followers.",
    "We sell to 123456789 people; our social team is small.",
    "We're at acme dot io",
    "Find us at routewise.example",
    "look at routewise dot com for pricing",
    "Our pricing is at routewise dot com",
    "Meet me at the office at 10",
    "I used to work at Gmail",
    "Sam at Acme runs the pilot",
    "the email is in the doc",
    "that's a dot com company",
  ])("leaves %j alone", (text) => {
    expect(redactPii(text)).toBe(text);
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
    redactPii("jane dot ".repeat(12_000) + "at");
    redactPii("a [at] ".repeat(14_000));
    redactPii("1.".repeat(50_000));
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe("redactReply", () => {
  it("redacts what redactPii redacts", () => {
    expect(redactReply("Call me on 617 555 0100 or a.b@x.io.")).toBe(
      "Call me on [phone] or [email].",
    );
    expect(redactReply("电话：６１７５５５０１００。")).toBe(
      redactPii("电话：６１７５５５０１００。"),
    );
  });

  it("returns text with nothing to redact exactly as written, full-width forms included", () => {
    for (const text of ["好的！请问价格是多少？", "Ｏｋ，下周见。", "We run 40 trucks a day."]) {
      expect(redactReply(text)).toBe(text);
    }
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

  it("redacts full-width and other scripts' digits after normalizing the turn", () => {
    expect(redactTurn("  ＳＳＮ  １２３－４５－６７８９ ")).toBe("SSN [ssn]");
    expect(redactTurn("We log 1234567890 events, call ６１７ ５５５ ０１００")).toBe(
      "We log 1234567890 events, call [phone]",
    );
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
