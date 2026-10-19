import type { RequestHandler } from "express";
import type { CoachClient } from "../../services/coach-client.js";
import { getHealth } from "./service.js";

export function healthHandler(coach: CoachClient | undefined): RequestHandler {
  return async (_req, res) => {
    res.json(await getHealth(coach));
  };
}
