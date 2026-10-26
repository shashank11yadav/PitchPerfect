"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSession } from "@/lib/session";
import { VerificationBanner } from "./VerificationBanner";

/** The employer pages a suspended company keeps: its company profile (read-only) and its account. */
const STILL_OPEN = ["/employer/company", "/employer/settings"];

/**
 * A suspended company's users see why the employer area is closed instead of the dashboard, jobs
 * and applicants, which the api refuses them anyway (`403 company_suspended`).
 */
export function SuspendedGate({ children }: { children: ReactNode }) {
  const { company } = useSession();
  const pathname = usePathname();
  const open = STILL_OPEN.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (company?.verification !== "suspended" || open) return children;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <VerificationBanner verification="suspended" website={company.website} />
      <p className="text-ink">
        <Link href="/employer/company" className="pp-link font-semibold text-primary">
          See your company profile
        </Link>{" "}
        or{" "}
        <Link href="/employer/settings" className="pp-link font-semibold text-primary">
          manage your account
        </Link>
        .
      </p>
    </div>
  );
}
