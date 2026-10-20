import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RoleShell } from "@/components/layout/RoleShell";
import { STUDENT_NAV } from "@/lib/site";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Every student page: the app shell, the student-only gate, and the unconfirmed-email banner. */
export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <RoleShell role="student" links={STUDENT_NAV} blocked="practice calls and job applications">
      {children}
    </RoleShell>
  );
}
