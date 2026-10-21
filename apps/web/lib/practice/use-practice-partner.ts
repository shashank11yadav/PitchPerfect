"use client";

import type { PracticePartnerKind, PracticeQuota } from "@pitchperfect/shared";
import { Quota } from "@/lib/student-api";
import { useApi, type Loaded } from "@/lib/use-api";

/**
 * Which partner the student gets, from the quota answer. Until the api has said "scripted" the
 * partner is described as a live model, the disclosure that is safe to be wrong about.
 */
const partnerOf = (quota: Loaded<PracticeQuota>): PracticePartnerKind =>
  quota.state === "ready" ? quota.data.practicePartner : "live";

/** The student's quota, with the kind of partner the api says is answering. */
export function usePracticeQuota() {
  const quota = useApi("/practice/quota", Quota);
  return { ...quota, partner: partnerOf(quota) };
}

export type PracticeQuotaLoad = ReturnType<typeof usePracticeQuota>;
