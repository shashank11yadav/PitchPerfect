/** One provider attempt in the coach. `COACH_TIMEOUT_MS` overrides it in the coach only. */
const providerCallMs = 30_000;

/**
 * The api's wait for one coach call. One provider attempt plus a margin: the coach answers a
 * failed attempt itself, and a retry after a quick failure (429, 5xx) still fits. A retry after an
 * attempt that ran its full timeout does not: the api gives up first and answers
 * `502 upstream_error`.
 */
const coachCallMs = providerCallMs + 5_000;

/** A turn's hold on its attempt: one coach call plus the api's own writes before and after it. */
const turnLockMs = coachCallMs + 10_000;

/** The api's wait for the coach's `/healthz`. */
const coachHealthMs = 2_000;

/**
 * Every timeout on the practice path, web proxy → api → coach → model provider, in one place.
 * Each outer one is derived from the one inside it plus a margin, so the inner side gives up, and
 * says why, before the outer side cuts it off.
 */
export const TIMEOUTS = {
  providerCallMs,
  /** One moderation check in the coach. `COACH_MODERATION_TIMEOUT_MS` overrides it. */
  moderationMs: 5_000,
  /** Retries of a provider call after a retryable error, each with a fresh `providerCallMs`. */
  providerRetries: 1,
  /** The coach's keep-alive comment on a turn stream, well inside the api's wait for it. */
  coachHeartbeatMs: 15_000,
  coachCallMs,
  turnLockMs,
  /**
   * Longest a request through the web's `/api` proxy may sit idle. Ending a session is the
   * longest silent api request: it waits out a turn's lock, then makes one coach call to score.
   */
  webProxyMs: turnLockMs + coachCallMs + 10_000,
  coachHealthMs,
  /**
   * The web server's own calls to the api (pages, sitemap). The slowest of them, the practice
   * partner, may wait on the coach's `/healthz`.
   */
  serverApiMs: coachHealthMs + 3_000,
} as const;
