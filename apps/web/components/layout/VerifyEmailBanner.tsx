"use client";

import { MailWarning } from "lucide-react";
import { useId } from "react";
import { ResendVerification } from "@/components/auth/ResendVerification";
import { useSession } from "@/lib/session";

interface VerifyEmailBannerProps {
  /** What waits for a confirmed address, e.g. "practice sessions and applying to jobs". */
  blocked: string;
}

/** Shown on every signed-in page until the user's email is confirmed. */
export function VerifyEmailBanner({ blocked }: VerifyEmailBannerProps) {
  const { user } = useSession();
  const headingId = useId();
  if (!user || user.emailVerifiedAt) return null;

  return (
    <section
      aria-labelledby={headingId}
      className="mb-6 flex flex-col gap-4 rounded-card border border-warning/50 bg-warning/10 p-5"
    >
      <div className="flex gap-3">
        <MailWarning aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink" />
        <div>
          <h2 id={headingId} className="font-sans text-body font-bold text-ink">
            Confirm your email
          </h2>
          <p className="mt-1 max-w-[62ch] text-ink">
            You can look around, but {blocked} wait until you click the link we sent to{" "}
            <span className="font-semibold [overflow-wrap:anywhere]">{user.email}</span>.
          </p>
        </div>
      </div>
      <ResendVerification
        email={user.email}
        size="sm"
        variant="secondary"
        className="pl-8 sm:flex-row sm:items-center sm:gap-4"
      />
    </section>
  );
}
