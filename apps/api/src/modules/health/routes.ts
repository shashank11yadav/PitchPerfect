import { Router } from "express";
import { MINUTE_MS } from "@pitchperfect/shared";
import { byIp, rateLimit } from "../../middleware/rate-limit.js";
import type { CoachProbe } from "../../services/coach-probe.js";
import { healthHandler } from "./handlers.js";

/**
 * `GET /api/health`. Public and unauthenticated, so it carries a generous per-address limit:
 * a platform prober checking every few seconds stays far under it, a flood doesn't. The counter
 * is in memory, per instance: health has to answer (with `db: "down"`) when the database can't.
 */
export function healthRoutes(probe: CoachProbe): Router {
  const limit = rateLimit("health", {
    windowMs: MINUTE_MS,
    limit: 120,
    key: byIp,
    store: "memory",
  });
  return Router().get("/health", limit, healthHandler(probe));
}
