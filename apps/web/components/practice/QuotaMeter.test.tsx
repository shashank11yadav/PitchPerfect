import type { PracticeQuota } from "@pitchperfect/shared";
import { render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { QuotaMeter } from "./QuotaMeter";

const zone = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/New_York";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T16:00:00.000Z"));
});
afterAll(() => {
  vi.useRealTimers();
  process.env.TZ = zone;
});

const quota = (overrides: Partial<PracticeQuota> = {}): PracticeQuota => ({
  dailyUsed: 2,
  dailyLimit: 5,
  monthlyUsed: 7,
  monthlyLimit: 30,
  available: true,
  resetsAt: "2026-10-21T00:00:00.000Z",
  ...overrides,
});

describe("QuotaMeter", () => {
  it("says when the daily count starts over, in local time", () => {
    render(<QuotaMeter quota={quota()} />);
    expect(screen.getByText("2 of 5 today")).toBeInTheDocument();
    expect(screen.getByText(/starts over today at 8:00 PM EDT/)).toBeInTheDocument();
  });

  it("gives the monthly reset as a local date and time", () => {
    render(<QuotaMeter quota={quota({ monthlyUsed: 30, available: false })} />);
    // November 1 00:00 UTC is the evening of October 31 in New York.
    expect(
      screen.getByText(/They start over Saturday, October 31 at 8:00 PM EDT\./),
    ).toBeInTheDocument();
  });

  it("explains a pause for everyone when the student still has sessions left", () => {
    render(<QuotaMeter quota={quota({ available: false })} />);
    expect(
      screen.getByText("Practice is paused for today. It opens again today at 8:00 PM EDT."),
    ).toBeInTheDocument();
  });
});
