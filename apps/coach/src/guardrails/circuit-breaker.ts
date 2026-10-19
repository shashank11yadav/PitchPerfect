import { ProviderError } from "../providers/index.js";

export interface CircuitBreakerOptions {
  failures: number;
  windowMs: number;
  openMs: number;
  now?: () => number;
}

/**
 * Opens after `failures` retryable provider errors within `windowMs`, rejects calls for `openMs`,
 * then lets one trial call through. A successful trial closes it; a retryable failure reopens it.
 */
export class CircuitBreaker {
  readonly #options: Required<CircuitBreakerOptions>;
  #failedAt: number[] = [];
  #openUntil = 0;
  #open = false;
  #trialInFlight = false;

  constructor(options: CircuitBreakerOptions) {
    this.#options = { now: Date.now, ...options };
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    const trial = this.#admit();
    try {
      const result = await fn();
      if (trial) this.#close();
      return result;
    } catch (error) {
      if (error instanceof ProviderError && error.retryable) this.#recordFailure(trial);
      throw error;
    } finally {
      if (trial) this.#trialInFlight = false;
    }
  }

  /** Throws while open; returns true when this call is the half-open trial. */
  #admit(): boolean {
    if (!this.#open) return false;
    if (this.#options.now() < this.#openUntil || this.#trialInFlight) {
      throw new ProviderError("practice_unavailable");
    }
    this.#trialInFlight = true;
    return true;
  }

  #recordFailure(trial: boolean): void {
    const now = this.#options.now();
    this.#failedAt = this.#failedAt.filter((at) => now - at < this.#options.windowMs);
    this.#failedAt.push(now);
    if (trial || this.#failedAt.length >= this.#options.failures) {
      this.#open = true;
      this.#openUntil = now + this.#options.openMs;
    }
  }

  #close(): void {
    this.#open = false;
    this.#failedAt = [];
  }
}

export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  signal?: AbortSignal;
  /** Injected in tests. */
  random?: () => number;
}

function abortError(signal: AbortSignal): ProviderError {
  const timedOut = signal.reason instanceof Error && signal.reason.name === "TimeoutError";
  return new ProviderError(timedOut ? "timeout" : "aborted", { cause: signal.reason });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      if (signal) reject(abortError(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Calls `fn`, retrying `retries` times on retryable provider errors after a jittered backoff
 * of `baseMs * 2^attempt` scaled by 0.5–1. An aborted signal stops it.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 1, baseMs = 250, signal, random = Math.random } = options;
  for (let attempt = 0; ; attempt += 1) {
    if (signal?.aborted) throw abortError(signal);
    try {
      return await fn();
    } catch (error) {
      const retryable = error instanceof ProviderError && error.retryable;
      if (!retryable || attempt >= retries) throw error;
      if (signal?.aborted) throw abortError(signal);
      await sleep(baseMs * 2 ** attempt * (0.5 + random() * 0.5), signal);
    }
  }
}

/** A signal that aborts after `ms`, or sooner when the caller's signal does. */
export function withTimeout(ms: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
