export type HealthStatus = "ok" | "down";

export interface CoachClient {
  health(): Promise<HealthStatus>;
}

const HEALTH_TIMEOUT_MS = 2000;

/** Checks the coach service's `/healthz`; any failure or timeout counts as down. */
export function createHttpCoachClient(coachUrl: string): CoachClient {
  return {
    async health() {
      try {
        const res = await fetch(new URL("/healthz", coachUrl), {
          signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        });
        return res.ok ? "ok" : "down";
      } catch {
        return "down";
      }
    },
  };
}
