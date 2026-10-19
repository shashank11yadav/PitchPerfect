import type { Request, RequestHandler } from "express";
import {
  ipKeyGenerator,
  rateLimit as expressRateLimit,
  type RateLimitInfo,
} from "express-rate-limit";
import { RateLimitedError } from "../errors.js";
import { createRateLimitStore } from "./rate-limit-store.js";

export interface RateLimitOptions {
  windowMs: number;
  limit: number;
  /** What to count by, e.g. the client IP or a normalized email. */
  key: (req: Request) => string;
}

const IPV6_SUBNET = 64;

/** Key by client address; IPv6 addresses are grouped by /64, the usual per-customer allocation. */
export const byIp = (req: Request): string => ipKeyGenerator(req.ip ?? "unknown", IPV6_SUBNET);

/**
 * Fixed-window limiter backed by Mongo. Over the limit it fails with `rate_limited` (429) and a
 * `Retry-After` header via the shared error handler. Create it once at route setup, not per request.
 */
export function rateLimit(name: string, options: RateLimitOptions): RequestHandler {
  return expressRateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    keyGenerator: options.key,
    store: createRateLimitStore(name),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, _res, next) => {
      const resetTime = (req as Request & { rateLimit?: RateLimitInfo }).rateLimit?.resetTime;
      const wait = resetTime ? resetTime.getTime() - Date.now() : options.windowMs;
      next(new RateLimitedError(Math.max(1, Math.ceil(wait / 1000))));
    },
  });
}
