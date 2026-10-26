import { describe, expect, it } from "vitest";
import { TIMEOUTS } from "./timeouts.js";

describe("TIMEOUTS", () => {
  it("gives every outer timeout more time than the one inside it", () => {
    const chain: [outer: keyof typeof TIMEOUTS, inner: number][] = [
      ["providerCallMs", TIMEOUTS.moderationMs],
      ["coachCallMs", TIMEOUTS.providerCallMs],
      ["coachCallMs", TIMEOUTS.coachHeartbeatMs],
      ["turnLockMs", TIMEOUTS.coachCallMs],
      ["webProxyMs", TIMEOUTS.coachCallMs],
      ["webProxyMs", TIMEOUTS.turnLockMs + TIMEOUTS.coachCallMs],
      ["serverApiMs", TIMEOUTS.coachHealthMs],
    ];
    for (const [outer, inner] of chain) {
      expect(TIMEOUTS[outer], outer).toBeGreaterThan(inner);
    }
  });

  it("keeps the deployed values", () => {
    expect(TIMEOUTS).toMatchObject({
      providerCallMs: 30_000,
      moderationMs: 5_000,
      providerRetries: 1,
      coachCallMs: 35_000,
      turnLockMs: 45_000,
      webProxyMs: 90_000,
      coachHealthMs: 2_000,
      serverApiMs: 5_000,
    });
  });
});
