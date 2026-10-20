import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  formatInterviewTime,
  formatResetTime,
  isoToLocalInput,
  localInputToIso,
} from "./local-time";

const zone = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/New_York";
});
afterAll(() => {
  process.env.TZ = zone;
});

describe("local time", () => {
  it("shows an interview in the viewer's zone with its abbreviation", () => {
    expect(formatInterviewTime("2026-11-03T15:30:00.000Z")).toBe(
      "Tuesday, November 3, 2026 at 10:30 AM EST",
    );
    expect(formatInterviewTime("2026-10-21T13:00:00.000Z")).toBe(
      "Wednesday, October 21, 2026 at 9:00 AM EDT",
    );
  });

  it("follows the zone the viewer is in", () => {
    process.env.TZ = "Asia/Kolkata";
    expect(formatInterviewTime("2026-11-03T15:30:00.000Z")).toBe(
      "Tuesday, November 3, 2026 at 9:00 PM GMT+5:30",
    );
    process.env.TZ = "America/New_York";
  });

  it("says whether the UTC midnight reset falls today or tomorrow locally", () => {
    const reset = "2026-10-21T00:00:00.000Z";
    expect(formatResetTime(reset, new Date("2026-10-20T16:00:00.000Z"))).toBe(
      "today at 8:00 PM EDT",
    );
    process.env.TZ = "Europe/Berlin";
    expect(formatResetTime(reset, new Date("2026-10-20T16:00:00.000Z"))).toBe(
      "tomorrow at 2:00 AM GMT+2",
    );
    process.env.TZ = "America/New_York";
  });

  it("reads a datetime-local value in the viewer's zone and sends it as UTC", () => {
    expect(localInputToIso("2026-11-02T15:00")).toBe("2026-11-02T20:00:00.000Z");
    expect(localInputToIso("2026-10-21T09:30")).toBe("2026-10-21T13:30:00.000Z");
    process.env.TZ = "Asia/Kolkata";
    expect(localInputToIso("2026-11-02T15:00")).toBe("2026-11-02T09:30:00.000Z");
    process.env.TZ = "America/New_York";
  });

  it("refuses anything that isn't a whole datetime-local value", () => {
    for (const value of [
      "",
      "2026-11-02",
      "15:00",
      "2026-13-02T15:00",
      "2026-02-30T15:00",
      "soon",
    ]) {
      expect(localInputToIso(value)).toBeNull();
    }
  });

  it("fills a datetime-local input from a UTC time, in the viewer's zone", () => {
    expect(isoToLocalInput("2026-11-03T15:30:00.000Z")).toBe("2026-11-03T10:30");
    expect(isoToLocalInput("2026-10-21T04:05:00.000Z")).toBe("2026-10-21T00:05");
  });
});
