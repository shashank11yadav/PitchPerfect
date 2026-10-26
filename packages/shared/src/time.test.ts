import { describe, expect, it } from "vitest";
import { DAY_MS, HOUR_MS, MINUTE_MS, secondsUntil, utcDay, utcMonth } from "./time.js";

const now = new Date("2026-10-22T15:30:45.000Z");

describe("UTC calendar helpers", () => {
  it("spells out a minute, an hour and a day in milliseconds", () => {
    expect([MINUTE_MS, HOUR_MS, DAY_MS]).toEqual([60_000, 3_600_000, 86_400_000]);
  });

  it("finds the start of today, tomorrow and the next month", () => {
    expect(utcDay(now).toISOString()).toBe("2026-10-22T00:00:00.000Z");
    expect(utcDay(now, 1).toISOString()).toBe("2026-10-23T00:00:00.000Z");
    expect(utcMonth(now).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(utcMonth(now, 1).toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("counts whole seconds until a moment, never fewer than one", () => {
    expect(secondsUntil(now, utcDay(now, 1))).toBe(8 * 3600 + 29 * 60 + 15);
    expect(secondsUntil(now, now)).toBe(1);
  });
});
