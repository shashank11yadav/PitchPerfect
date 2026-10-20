"use client";

import type { Role } from "@pitchperfect/shared";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { roleHome } from "@/lib/redirects";
import { RequireRole } from "@/lib/session";
import type { NavLink } from "@/lib/site";
import { AccountMenu } from "./AccountMenu";
import { AppShell } from "./AppShell";
import { VerifyEmailBanner } from "./VerifyEmailBanner";

interface RoleShellProps {
  role: Role;
  links: readonly NavLink[];
  /** What an unconfirmed email holds back, for the banner. */
  blocked: string;
  children: ReactNode;
}

/**
 * The signed-in frame for one role: the app shell with its account menu, the role gate around
 * the page, and the unconfirmed-email banner above it. Settings sits under the role's home.
 */
export function RoleShell({ role, links, blocked, children }: RoleShellProps) {
  const pathname = usePathname();
  const settingsHref = `${roleHome(role)}/settings`;
  const onSettings = pathname === settingsHref || pathname.startsWith(`${settingsHref}/`);

  return (
    <AppShell
      links={links}
      title={onSettings ? "Settings" : undefined}
      account={<AccountMenu settingsHref={settingsHref} />}
    >
      <RequireRole role={role}>
        <VerifyEmailBanner blocked={blocked} />
        {children}
      </RequireRole>
    </AppShell>
  );
}
