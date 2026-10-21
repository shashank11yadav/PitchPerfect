import "server-only";
import { HealthResponseSchema, type PracticePartnerKind } from "@pitchperfect/shared";
import { serverApi } from "./server-api";

/**
 * Which partner this deployment runs, for server-rendered copy (privacy, terms). The api reports
 * it on `/api/health`; if the api can't be reached the partner is described as a live model,
 * the disclosure that is safe to be wrong about.
 */
export async function practicePartnerKind(): Promise<PracticePartnerKind> {
  try {
    return (await serverApi("/api/health", HealthResponseSchema)).practicePartner;
  } catch {
    return "live";
  }
}
