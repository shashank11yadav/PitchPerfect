import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DemoUnavailable } from "@/components/demo/DemoNotice";
import { RoleShell } from "@/components/layout/RoleShell";
import { SiteFrame } from "@/components/layout/SiteFrame";
import { PAGES_EXPORT } from "@/lib/pages-export";
import { STUDENT_NAV } from "@/lib/site";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Every student page: the app shell, the student-only gate, and the unconfirmed-email banner.
 * The static demo has no accounts, so every one of these routes shows the note instead.
 */
export default function StudentLayout({ children }: { children: ReactNode }) {
  if (PAGES_EXPORT) {
    return (
      <SiteFrame>
        <DemoUnavailable area="student" />
      </SiteFrame>
    );
  }
  return (
    <RoleShell role="student" links={STUDENT_NAV} blocked="practice calls and job applications">
      {children}
    </RoleShell>
  );
}
