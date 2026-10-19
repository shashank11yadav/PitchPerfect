import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { ForbiddenError } from "../errors.js";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Rejects requests that lack the shared `x-pp-proxy` secret the web app adds when it proxies.
 * `GET /api/health` is exempt: platform health checks can't send the header and it only reports ok/down.
 */
export function proxyGuard(secret: string): RequestHandler {
  const expected = digest(secret);
  return (req, _res, next) => {
    if (req.method === "GET" && req.path === "/api/health") {
      next();
      return;
    }
    const supplied = req.get("x-pp-proxy");
    if (supplied === undefined || !timingSafeEqual(digest(supplied), expected)) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}
