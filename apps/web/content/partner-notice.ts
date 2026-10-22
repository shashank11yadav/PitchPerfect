import type { PracticePartnerKind } from "@pitchperfect/shared";

/**
 * What a partner that isn't a live model does with your words, said once and shown wherever the
 * partner is described: the practice lobby and the privacy policy. docs/security.md has the data
 * flow; the static demo's is in docs/deploy.md.
 */
export const SCRIPTED_PARTNER_NOTICE =
  "This demo’s practice partner is scripted and runs on our server; what you say isn’t sent to an AI provider.";

export const BROWSER_PARTNER_NOTICE =
  "This demo’s practice partner is scripted and runs in this browser tab, and so does the scorer. Typed text never leaves the page, and your sessions stay in this tab until you close it.";

/** The notice for a partner that isn't a live model, or undefined for one that is. */
export function partnerNotice(partner: PracticePartnerKind): string | undefined {
  if (partner === "scripted") return SCRIPTED_PARTNER_NOTICE;
  if (partner === "browser") return BROWSER_PARTNER_NOTICE;
  return undefined;
}
