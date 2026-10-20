import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Text links on the auth pages. Here, not in a client module, so server pages can use it too. */
export const AUTH_LINK = "pp-link rounded-control font-semibold text-primary";

interface AuthCardProps {
  /** The page's h1. */
  title: string;
  lead: ReactNode;
  /** A line under the lead, usually the way to the other form ("No account yet? …"). */
  aside?: ReactNode;
  /** `wide` for the sign-up forms, which run long. */
  size?: "narrow" | "wide";
  children: ReactNode;
}

/**
 * The auth pages' composition: a soft blue field with the title on the left, the form on white on
 * the right. The blue reaches the screen's left edge and the white its right edge, and on long
 * forms the title stays in view while the form scrolls. On phones the blue is a band above the
 * form. (Soft blue, not navy, so the field doesn't run into the navy footer.)
 */
export function AuthCard({ title, lead, aside, size = "narrow", children }: AuthCardProps) {
  return (
    <div className="bg-surface lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="bg-primary-soft text-ink">
        <div
          className={cn(
            "px-4 pt-12 pb-14 sm:px-6 lg:sticky lg:top-16 lg:pt-24 lg:pb-24",
            // Line the text up with the 1360 px column the rest of the site uses.
            "lg:pr-12 lg:pl-[max(2rem,calc((100vw-1360px)/2+2rem))]",
          )}
        >
          <h1 className="max-w-[12ch] text-title font-bold text-navy">{title}</h1>
          <div className="mt-6 max-w-[38ch] text-lede text-ink lg:mt-8">{lead}</div>
          {aside && <div className="mt-8 max-w-[38ch] text-body text-ink lg:mt-12">{aside}</div>}
        </div>
      </div>
      <div
        className={cn(
          "px-4 pt-10 pb-20 sm:px-6 lg:pt-24 lg:pb-32 lg:pl-16",
          "lg:pr-[max(2rem,calc((100vw-1360px)/2+2rem))]",
        )}
      >
        <div className={size === "wide" ? "max-w-2xl" : "max-w-md"}>{children}</div>
      </div>
    </div>
  );
}
