import type { ReactNode } from "react";
import { SiteFrame } from "@/components/layout/SiteFrame";

/**
 * Sign-in, sign-up, email confirmation and password reset. They sit in the public site's frame,
 * so the navbar (and its session state) and the footer stay the same as on every public page.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
