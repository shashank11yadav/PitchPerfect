import { randomUUID } from "node:crypto";
import type { RequestHandler, Response } from "express";
import { proxySecretCheck } from "./proxy-guard.js";

const ACCEPTABLE_ID = /^[\w-]{8,64}$/;

/**
 * Gives every request an id, echoed as `x-request-id`. An incoming `x-request-id` is kept only from
 * the web proxy (the request carries the `x-pp-proxy` secret) and only if it is well-formed; any
 * other is ignored and a new one generated, so a client can't choose the id its requests are
 * logged under. Without a proxy secret every id is generated.
 */
export function requestId(proxySecret: string | undefined): RequestHandler {
  const fromProxy = proxySecretCheck(proxySecret);
  return (req, res, next) => {
    const incoming = fromProxy(req) ? req.get("x-request-id") : undefined;
    const id = incoming && ACCEPTABLE_ID.test(incoming) ? incoming : randomUUID();
    req.id = id;
    res.locals.requestId = id;
    res.setHeader("x-request-id", id);
    next();
  };
}

export function requestIdOf(res: Response): string {
  const id: unknown = res.locals.requestId;
  return typeof id === "string" ? id : "unknown";
}
