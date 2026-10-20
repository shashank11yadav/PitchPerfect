import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RoleShell } from "@/components/layout/RoleShell";
import { EMPLOYER_NAV } from "@/lib/site";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Every employer page: the app shell, the employer-only gate, and the unconfirmed-email banner. */
export default function EmployerLayout({ children }: { children: ReactNode }) {
  return (
    <RoleShell role="employer" links={EMPLOYER_NAV} blocked="posting jobs and managing applicants">
      {children}
    </RoleShell>
  );
}
