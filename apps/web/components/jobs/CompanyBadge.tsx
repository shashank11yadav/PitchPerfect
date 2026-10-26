import type { CompanyVerification } from "@pitchperfect/shared";
import { BadgeCheck, CircleAlert, SquareDashed } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

/**
 * Whether the employer proved it owns its domain. A verified badge names that domain ("Verified ·
 * acme-demo.example"), so a big name on someone else's domain is plain to see. Anything short of
 * verified reads as unverified. A sample company (its website is on a reserved domain, as the
 * seeded ones are) is labeled as a sample whatever its verification says.
 */
export function CompanyBadge({
  verification,
  domain,
  sample,
  onDark = false,
}: {
  verification: CompanyVerification;
  /** The registrable domain the badge vouches for: `verifiedDomain` from the api. */
  domain: string | null;
  /** `sample` from the api: the company is made up. */
  sample: boolean;
  /** On navy the tinted badge would vanish, so it sits on a white chip there. */
  onDark?: boolean;
}) {
  const badge = sample ? (
    <Badge>
      <SquareDashed aria-hidden="true" className="size-3.5" />
      Sample company
    </Badge>
  ) : verification === "verified" ? (
    <Badge tone="success">
      <BadgeCheck aria-hidden="true" className="size-3.5" />
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {domain ? `Verified · ${domain}` : "Verified company"}
      </span>
    </Badge>
  ) : (
    <Badge tone="warning">
      <CircleAlert aria-hidden="true" className="size-3.5" />
      Unverified employer
    </Badge>
  );
  return onDark ? <span className="inline-flex rounded-pill bg-white">{badge}</span> : badge;
}
