import { Router } from "express";
import type { CoachClient } from "../../services/coach-client.js";
import { healthHandler } from "./handlers.js";

export function healthRoutes(coach: CoachClient | undefined): Router {
  return Router().get("/health", healthHandler(coach));
}
