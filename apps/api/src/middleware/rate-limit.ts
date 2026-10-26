import { createHash } from "node:crypto";
import type { Request, RequestHandler } from "express";
import {
  ipKeyGenerator,
  rateLimit as expressRateLimit,
  type RateLimitInfo,
} from "express-rate-limit";
import { RateLimitedError } from "../errors.js";
import { createRateLimitStore } from "./rate-limit-store.js";
import { sessionUserId } from "./session.js";

export interface RateLimitOptions {
  windowMs: number;
  limit: number;
  /** What to count by, e.g. the client IP or a normalized email. */
  key: (req: Request) => string;
  /**
   * Where the counters live. `mongo` (the default) is shared by every api instance; `memory` is
   * per instance and keeps working when the database is down, which only the health check needs.
   * Either way only a hash of the key is kept, never the address itself.
   */
  store?: "mongo" | "memory";
  /**
   * Count only requests that succeed: a refused one (any 4xx or 5xx, the 429 itself included) is
   * taken back off the counter. For limits on what a request does, such as emails sent.
   */
  successfulOnly?: boolean;
}

const hashed = (key: string) => createHash("sha256").update(key).digest("hex");

const IPV6_SUBNET = 64;

/** Key by client address; IPv6 addresses are grouped by /64, the usual per-customer allocation. */
export const byIp = (req: Request): string => ipKeyGenerator(req.ip ?? "unknown", IPV6_SUBNET);

/** Key by the signed-in user, falling back to the client address when there is no session. */
export const byUser = (req: Request): string => sessionUserId(req) ?? byIp(req);

/**
 * Fixed-window limiter, backed by Mongo unless `store: "memory"`. Over the limit it fails with
 * `rate_limited` (429) and a `Retry-After` header via the shared error handler. Create it once at
 * route setup, not per request.
 */
export function rateLimit(name: string, options: RateLimitOptions): RequestHandler {
  return expressRateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    // express-rate-limit's own in-memory store when asked (the Mongo store hashes keys itself).
    ...(options.store === "memory"
      ? { keyGenerator: (req: Request) => hashed(options.key(req)) }
      : { keyGenerator: options.key, store: createRateLimitStore(name) }),
    skipFailedRequests: options.successfulOnly ?? false,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, _res, next) => {
      const resetTime = (req as Request & { rateLimit?: RateLimitInfo }).rateLimit?.resetTime;
      const wait = resetTime ? resetTime.getTime() - Date.now() : options.windowMs;
      next(new RateLimitedError(Math.max(1, Math.ceil(wait / 1000))));
    },
  });
}
