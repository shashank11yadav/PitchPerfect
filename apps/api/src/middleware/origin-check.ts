import type { Request, RequestHandler } from "express";
import type { Config } from "../config.js";
import { ForbiddenError } from "../errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** The request's claimed origin: `Origin` when present, otherwise the origin of `Referer`. */
function requestOrigin(req: Request): string | undefined {
  const origin = req.get("origin");
  if (origin) return origin;
  const referer = req.get("referer");
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/** Rejects state-changing requests that don't come from the app's own origin. */
export function originCheck(config: Config): RequestHandler {
  const allowed = new URL(config.APP_URL).origin;
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method) || requestOrigin(req) === allowed) {
      next();
      return;
    }
    next(new ForbiddenError("csrf_failed", "This request didn’t come from PitchPerfect"));
  };
}
