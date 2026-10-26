import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DemoUnavailable } from "@/components/demo/DemoNotice";
import { SuspendedGate } from "@/components/employer/SuspendedGate";
import { RoleShell } from "@/components/layout/RoleShell";
import { SiteFrame } from "@/components/layout/SiteFrame";
import { PAGES_EXPORT } from "@/lib/pages-export";
import { EMPLOYER_NAV } from "@/lib/site";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Every employer page: the app shell, the employer-only gate, the unconfirmed-email banner, and
 * the suspended-company notice.
 * The static demo has no accounts, so every one of these routes shows the note instead.
 */
export default function EmployerLayout({ children }: { children: ReactNode }) {
  if (PAGES_EXPORT) {
    return (
      <SiteFrame>
        <DemoUnavailable area="employer" />
      </SiteFrame>
    );
  }
  return (
    <RoleShell role="employer" links={EMPLOYER_NAV} blocked="posting jobs and managing applicants">
      <SuspendedGate>{children}</SuspendedGate>
    </RoleShell>
  );
}
