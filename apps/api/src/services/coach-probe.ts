import type { PracticePartnerKind } from "@pitchperfect/shared";
import type { CoachClient, CoachHealth } from "./coach-client.js";

/** How long one answer from the coach's `/healthz` is reused. */
export const COACH_PROBE_TTL_MS = 30_000;

/** The coach's health, at most one probe per TTL however many callers ask. */
export type CoachProbe = () => Promise<CoachHealth>;

const DOWN: CoachHealth = { status: "down", provider: undefined };

/**
 * Wraps `coach.health()` in a short cache, so `GET /api/health` and `GET /api/practice/quota`
 * can both report the coach without fanning every request out to it. Callers that arrive while
 * a probe is in flight share its answer; without a coach, the answer is always down.
 */
export function createCoachProbe(
  coach: CoachClient | undefined,
  ttlMs = COACH_PROBE_TTL_MS,
): CoachProbe {
  let cached: { health: CoachHealth; until: number } | undefined;
  let pending: Promise<CoachHealth> | undefined;
  return async () => {
    if (!coach) return DOWN;
    if (cached && Date.now() < cached.until) return cached.health;
    pending ??= coach
      .health()
      .catch(() => DOWN)
      .then((health) => {
        cached = { health, until: Date.now() + ttlMs };
        pending = undefined;
        return health;
      });
    return pending;
  };
}

/**
 * The partner the student is really talking to. Only the `fake` provider is the scripted demo;
 * anything else, including a coach that can't be reached, is disclosed as a live model.
 */
export const practicePartnerOf = (health: CoachHealth): PracticePartnerKind =>
  health.status === "ok" && health.provider === "fake" ? "scripted" : "live";
