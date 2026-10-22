import type { ReactNode } from "react";
import { DemoUnavailable } from "@/components/demo/DemoNotice";
import { SiteFrame } from "@/components/layout/SiteFrame";
import { PAGES_EXPORT } from "@/lib/pages-export";

/**
 * Sign-in, sign-up, email confirmation and password reset. They sit in the public site's frame,
 * so the navbar (and its session state) and the footer stay the same as on every public page.
 * The static demo has no accounts, so these routes show the note instead of a form.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <SiteFrame>{PAGES_EXPORT ? <DemoUnavailable area="accounts" /> : children}</SiteFrame>;
}
