import type { CompanyVerification } from "@pitchperfect/shared";
import { BadgeCheck, CircleAlert } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

/** Whether the employer proved it owns its domain. Anything short of verified reads as unverified. */
export function CompanyBadge({
  verification,
  onDark = false,
}: {
  verification: CompanyVerification;
  /** On navy the tinted badge would vanish, so it sits on a white chip there. */
  onDark?: boolean;
}) {
  const badge =
    verification === "verified" ? (
      <Badge tone="success">
        <BadgeCheck aria-hidden="true" className="size-3.5" />
        Verified company
      </Badge>
    ) : (
      <Badge tone="warning">
        <CircleAlert aria-hidden="true" className="size-3.5" />
        Unverified employer
      </Badge>
    );
  return onDark ? <span className="inline-flex rounded-pill bg-white">{badge}</span> : badge;
}
