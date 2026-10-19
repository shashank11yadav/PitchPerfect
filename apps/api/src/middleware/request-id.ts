import { randomUUID } from "node:crypto";
import type { RequestHandler, Response } from "express";

const ACCEPTABLE_ID = /^[\w-]{8,64}$/;

/** Reuses a well-formed incoming `x-request-id`; otherwise generates one. Echoed on the response. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get("x-request-id");
  const id = incoming && ACCEPTABLE_ID.test(incoming) ? incoming : randomUUID();
  req.id = id;
  res.locals.requestId = id;
  res.setHeader("x-request-id", id);
  next();
};

export function requestIdOf(res: Response): string {
  const id: unknown = res.locals.requestId;
  return typeof id === "string" ? id : "unknown";
}
