import type { RequestHandler } from "express";
import type { CoachProbe } from "../../services/coach-probe.js";
import { getHealth } from "./service.js";

export function healthHandler(probe: CoachProbe): RequestHandler {
  return async (_req, res) => {
    res.json(await getHealth(probe));
  };
}
