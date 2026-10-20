import type { JobPay } from "@pitchperfect/shared";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatPay, PayText } from "./PayText";

const CASES: [string, JobPay][] = [
  [
    "$22–$28 per hour + commission",
    { type: "range", min: 22, max: 28, currency: "USD", frequency: "hourly", commission: true },
  ],
  ["Unpaid", { type: "unpaid" }],
  [
    "€45,000 per year",
    { type: "exact", amount: 45_000, currency: "EUR", frequency: "annually", commission: false },
  ],
  [
    "$52,000–$60,000 per year",
    {
      type: "range",
      min: 52_000,
      max: 60_000,
      currency: "USD",
      frequency: "annually",
      commission: false,
    },
  ],
  [
    "CA$1,200 per month + commission",
    { type: "exact", amount: 1_200, currency: "CAD", frequency: "monthly", commission: true },
  ],
  [
    "$18.50–$21.00 per hour",
    { type: "range", min: 18.5, max: 21, currency: "USD", frequency: "hourly", commission: false },
  ],
  [
    "$600 per week",
    { type: "exact", amount: 600, currency: "USD", frequency: "weekly", commission: false },
  ],
];

describe("PayText", () => {
  it.each(CASES)("formats %s", (expected, pay) => {
    const { container } = render(<PayText pay={pay} />);
    expect(container).toHaveTextContent(expected, { normalizeWhitespace: false });
    expect(formatPay(pay)).toBe(expected);
  });
});
