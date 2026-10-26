import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { ForbiddenError } from "../errors.js";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * A test for whether a request carries the shared `x-pp-proxy` secret the web app adds when it
 * proxies, compared in constant time. Always false without a secret.
 */
export function proxySecretCheck(secret: string | undefined): (req: Request) => boolean {
  if (!secret) return () => false;
  const expected = digest(secret);
  return (req) => {
    const supplied = req.get("x-pp-proxy");
    return supplied !== undefined && timingSafeEqual(digest(supplied), expected);
  };
}

/**
 * Rejects requests that lack the shared `x-pp-proxy` secret the web app adds when it proxies.
 * `GET /api/health` is exempt: platform health checks can't send the header and it only reports ok/down.
 */
export function proxyGuard(secret: string): RequestHandler {
  const fromProxy = proxySecretCheck(secret);
  return (req, _res, next) => {
    if (req.method === "GET" && req.path === "/api/health") {
      next();
      return;
    }
    next(fromProxy(req) ? undefined : new ForbiddenError());
  };
}
