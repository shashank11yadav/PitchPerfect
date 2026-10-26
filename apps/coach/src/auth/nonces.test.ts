import { describe, expect, it } from "vitest";
import { NonceCache } from "./nonces.js";

const NOW = 1_700_000_000;
const nonce = (n: number) => n.toString(16).padStart(32, "0");

describe("NonceCache", () => {
  it("accepts a nonce once and turns it away while its request is in the window", () => {
    const cache = new NonceCache();
    expect(cache.remember(nonce(1), NOW + 60, NOW)).toBe("fresh");
    expect(cache.remember(nonce(1), NOW + 60, NOW + 30)).toBe("replayed");
    expect(cache.remember(nonce(2), NOW + 60, NOW + 30)).toBe("fresh");
  });

  it("refuses new nonces once full, rather than forgetting live ones", () => {
    const cache = new NonceCache(2);
    expect(cache.remember(nonce(1), NOW + 60, NOW)).toBe("fresh");
    expect(cache.remember(nonce(2), NOW + 60, NOW)).toBe("fresh");
    expect(cache.remember(nonce(3), NOW + 60, NOW)).toBe("full");
    expect(cache.remember(nonce(1), NOW + 60, NOW)).toBe("replayed");
  });

  it("makes room by dropping nonces whose window has passed, in any order", () => {
    const cache = new NonceCache(2);
    // A skewed clock: the first nonce expires after the second.
    expect(cache.remember(nonce(1), NOW + 120, NOW)).toBe("fresh");
    expect(cache.remember(nonce(2), NOW + 10, NOW)).toBe("fresh");
    expect(cache.remember(nonce(3), NOW + 80, NOW + 20)).toBe("fresh");
    // Both earlier nonces have expired by now, so two new ones fit and a third does not.
    expect(cache.remember(nonce(4), NOW + 140, NOW + 125)).toBe("fresh");
    expect(cache.remember(nonce(5), NOW + 140, NOW + 125)).toBe("fresh");
    expect(cache.remember(nonce(6), NOW + 140, NOW + 125)).toBe("full");
  });
});
