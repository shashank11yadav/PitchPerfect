import "server-only";
import { HealthResponseSchema, type PracticePartnerKind } from "@pitchperfect/shared";
import { serverApi } from "./server-api";

/** How long one answer from the api stands in for the next ones, per web instance. */
const CACHE_MS = 60_000;

let cached: { kind: PracticePartnerKind; until: number } | undefined;

/**
 * Which partner this deployment runs, for server-rendered copy (privacy, terms, how it works).
 * The api reports it on `/api/health`; the answer is kept for a minute so pages rendered under
 * load don't each ask again. If the api can't be reached the partner is described as a live
 * model, the disclosure that is safe to be wrong about.
 */
export async function practicePartnerKind(): Promise<PracticePartnerKind> {
  const now = Date.now();
  if (cached && now < cached.until) return cached.kind;
  let kind: PracticePartnerKind = "live";
  try {
    kind = (await serverApi("/api/health", HealthResponseSchema)).practicePartner;
  } catch {
    // Unreachable api: live wording, for the next minute as well.
  }
  cached = { kind, until: now + CACHE_MS };
  return kind;
}

/** Forgets the cached answer, so a test can switch the partner between renders. */
export function forgetPracticePartnerKind(): void {
  cached = undefined;
}
