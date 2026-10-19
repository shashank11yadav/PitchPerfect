import { isDbConnected } from "../../db/connect.js";
import type { CoachClient, HealthStatus } from "../../services/coach-client.js";

export interface Health {
  status: "ok";
  db: HealthStatus;
  coach: HealthStatus;
}

/** Reports dependency status. It never fails: a down dependency is data, not an error. */
export async function getHealth(coach: CoachClient | undefined): Promise<Health> {
  return {
    status: "ok",
    db: isDbConnected() ? "ok" : "down",
    coach: (await coach?.health()) ?? "down",
  };
}
