import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "../providers/index.js";
import { CircuitBreaker, withRetry, withTimeout } from "./circuit-breaker.js";

const upstream = () => new ProviderError("upstream_unavailable", { status: 503 });
const rejected = () => new ProviderError("request_rejected", { status: 400 });

describe("CircuitBreaker", () => {
  let nowMs = 0;
  const now = () => nowMs;
  const breaker = () => new CircuitBreaker({ failures: 5, windowMs: 60_000, openMs: 30_000, now });
  const fail = (b: CircuitBreaker, error: Error = upstream()) =>
    b.exec(() => Promise.reject(error)).catch(() => undefined);

  beforeEach(() => {
    nowMs = 1_000_000;
  });

  it("passes results through while closed", async () => {
    await expect(breaker().exec(() => Promise.resolve(7))).resolves.toBe(7);
  });

  it("opens after 5 retryable failures in the window", async () => {
    const b = breaker();
    for (let i = 0; i < 5; i += 1) await fail(b);
    const fn = vi.fn(() => Promise.resolve(1));
    await expect(b.exec(fn)).rejects.toMatchObject({
      name: "ProviderError",
      code: "practice_unavailable",
      retryable: false,
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it("counts failures recorded outside exec (mid-stream errors), retryable ones only", async () => {
    const b = breaker();
    for (let i = 0; i < 6; i += 1) b.recordFailure(rejected());
    for (let i = 0; i < 4; i += 1) b.recordFailure(upstream());
    await expect(b.exec(() => Promise.resolve("ok"))).resolves.toBe("ok");
    b.recordFailure(upstream());
    await expect(b.exec(() => Promise.resolve(1))).rejects.toMatchObject({
      code: "practice_unavailable",
    });
  });

  it("does not open when failures are spread beyond the window", async () => {
    const b = breaker();
    for (let i = 0; i < 4; i += 1) await fail(b);
    nowMs += 60_001;
    await fail(b);
    await expect(b.exec(() => Promise.resolve("ok"))).resolves.toBe("ok");
  });

  it("ignores non-retryable and non-provider errors", async () => {
    const b = breaker();
    for (let i = 0; i < 6; i += 1) await fail(b, rejected());
    for (let i = 0; i < 6; i += 1) await fail(b, new Error("bug"));
    for (let i = 0; i < 6; i += 1) await fail(b, new ProviderError("aborted"));
    await expect(b.exec(() => Promise.resolve("ok"))).resolves.toBe("ok");
  });

  it("half-opens after 30 s and closes on a successful trial", async () => {
    const b = breaker();
    for (let i = 0; i < 5; i += 1) await fail(b);
    nowMs += 29_999;
    await expect(b.exec(() => Promise.resolve(1))).rejects.toMatchObject({
      code: "practice_unavailable",
    });
    nowMs += 1;
    await expect(b.exec(() => Promise.resolve("trial"))).resolves.toBe("trial");
    await expect(b.exec(() => Promise.resolve("again"))).resolves.toBe("again");
  });

  it("allows only one trial call while half-open", async () => {
    const b = breaker();
    for (let i = 0; i < 5; i += 1) await fail(b);
    nowMs += 30_000;
    let release: () => void = () => undefined;
    const trial = b.exec(
      () =>
        new Promise<string>((resolve) => {
          release = () => {
            resolve("done");
          };
        }),
    );
    await expect(b.exec(() => Promise.resolve("second"))).rejects.toMatchObject({
      code: "practice_unavailable",
    });
    release();
    await expect(trial).resolves.toBe("done");
  });

  it("reopens for another 30 s when the trial fails", async () => {
    const b = breaker();
    for (let i = 0; i < 5; i += 1) await fail(b);
    nowMs += 30_000;
    await fail(b);
    nowMs += 29_999;
    await expect(b.exec(() => Promise.resolve(1))).rejects.toMatchObject({
      code: "practice_unavailable",
    });
    nowMs += 1;
    await expect(b.exec(() => Promise.resolve("back"))).resolves.toBe("back");
  });

  it("frees the trial slot when the trial is aborted", async () => {
    const b = breaker();
    for (let i = 0; i < 5; i += 1) await fail(b);
    nowMs += 30_000;
    await fail(b, new ProviderError("aborted"));
    await expect(b.exec(() => Promise.resolve("next"))).resolves.toBe("next");
  });

  it("rethrows the original error", async () => {
    const error = upstream();
    await expect(breaker().exec(() => Promise.reject(error))).rejects.toBe(error);
  });
});

describe("withRetry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("retries once on a 429 then succeeds", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ProviderError("rate_limited", { status: 429 }))
      .mockResolvedValueOnce("ok");
    const result = withRetry(fn, { retries: 1, baseMs: 250, random: () => 0.5 });
    await vi.advanceTimersByTimeAsync(250);
    await expect(result).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("jitters the backoff between half and full base", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(upstream())
      .mockResolvedValueOnce("ok");
    const result = withRetry(fn, { retries: 1, baseMs: 250, random: () => 0 });
    await vi.advanceTimersByTimeAsync(124);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("ok");
  });

  it("gives up after the retries and throws the last error", async () => {
    const error = upstream();
    const fn = vi.fn(() => Promise.reject(error));
    const result = withRetry(fn, { retries: 1, baseMs: 10 });
    const assertion = expect(result).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable errors", async () => {
    const fn = vi.fn(() => Promise.reject(rejected()));
    await expect(withRetry(fn, { retries: 1, baseMs: 10 })).rejects.toMatchObject({
      code: "request_rejected",
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry unknown errors", async () => {
    const fn = vi.fn(() => Promise.reject(new Error("bug")));
    await expect(withRetry(fn, { retries: 1, baseMs: 10 })).rejects.toThrow("bug");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stops waiting when the signal aborts", async () => {
    const controller = new AbortController();
    const fn = vi.fn(() => Promise.reject(upstream()));
    const result = withRetry(fn, { retries: 1, baseMs: 10_000, signal: controller.signal });
    const assertion = expect(result).rejects.toMatchObject({ code: "aborted" });
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not start when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn(() => Promise.resolve("ok"));
    await expect(withRetry(fn, { signal: controller.signal })).rejects.toMatchObject({
      code: "aborted",
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it("does not retry after the signal aborted during the call", async () => {
    const controller = new AbortController();
    const fn = vi.fn(() => {
      controller.abort();
      return Promise.reject(upstream());
    });
    await expect(withRetry(fn, { signal: controller.signal })).rejects.toMatchObject({
      code: "aborted",
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("withTimeout", () => {
  it("aborts with a TimeoutError after the delay", async () => {
    const signal = withTimeout(20);
    expect(signal.aborted).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(signal.aborted).toBe(true);
    expect((signal.reason as Error).name).toBe("TimeoutError");
  });

  it("follows the caller signal", () => {
    const controller = new AbortController();
    const signal = withTimeout(60_000, controller.signal);
    expect(signal.aborted).toBe(false);
    controller.abort(new Error("stop"));
    expect(signal.aborted).toBe(true);
  });

  it("works without a caller signal", () => {
    expect(withTimeout(60_000).aborted).toBe(false);
  });
});
