import type { HealthResponse } from "@pitchperfect/shared";
import { isDbConnected } from "../../db/connect.js";
import { practicePartnerOf, type CoachProbe } from "../../services/coach-probe.js";

/** Reports dependency status. It never fails: a down dependency is data, not an error. */
export async function getHealth(probe: CoachProbe): Promise<HealthResponse> {
  const coach = await probe();
  return {
    status: "ok",
    db: isDbConnected() ? "ok" : "down",
    coach: coach.status,
    practicePartner: practicePartnerOf(coach),
  };
}
