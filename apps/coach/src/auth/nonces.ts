/**
 * Nonces remembered at once. Far above what the api sends in two minutes; past it, a signed
 * request is turned away until older nonces expire, never let through unchecked.
 */
const NONCE_CAPACITY = 100_000;

export type NonceVerdict = "fresh" | "replayed" | "full";

/**
 * The nonces of signed requests this process has accepted, each kept until its timestamp leaves
 * the signature window; after that the timestamp check rejects a replay on its own. It lives in
 * memory, so it covers one coach process: behind several instances, a replay sent to another
 * instance within the window is not caught, and the nonces would need a shared store.
 */
export class NonceCache {
  readonly #capacity: number;
  /** Nonce → the second after which its request is outside the window. Oldest first. */
  readonly #expiries = new Map<string, number>();

  constructor(capacity = NONCE_CAPACITY) {
    this.#capacity = capacity;
  }

  /** Records a nonce from a request whose signature checked out. */
  remember(nonce: string, expiresSec: number, nowSec: number): NonceVerdict {
    if (this.#expiries.has(nonce)) return "replayed";
    this.#dropExpired(nowSec, false);
    if (this.#expiries.size >= this.#capacity) this.#dropExpired(nowSec, true);
    if (this.#expiries.size >= this.#capacity) return "full";
    this.#expiries.set(nonce, expiresSec);
    return "fresh";
  }

  /**
   * Drops expired nonces. Entries are in arrival order, which matches expiry order only roughly
   * (timestamps may be skewed), so the usual pass stops at the first live one; a `full` pass reads
   * them all.
   */
  #dropExpired(nowSec: number, full: boolean): void {
    for (const [nonce, expiresSec] of this.#expiries) {
      if (expiresSec < nowSec) this.#expiries.delete(nonce);
      else if (!full) return;
    }
  }
}
