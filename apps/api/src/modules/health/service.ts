import type { HealthResponse } from "@pitchperfect/shared";
import { isDbConnected } from "../../db/connect.js";
import type { CoachProbe } from "../../services/coach-probe.js";

/**
 * Liveness: the api answers, and whether the database and the coach do. It never fails (a down
 * dependency is data, not an error) and names no versions, providers or settings.
 */
export async function getHealth(probe: CoachProbe): Promise<HealthResponse> {
  const coach = await probe();
  return { status: "ok", db: isDbConnected() ? "ok" : "down", coach: coach.status };
}
