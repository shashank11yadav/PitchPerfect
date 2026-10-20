import type { ReactNode } from "react";
import { SiteFrame } from "@/components/layout/SiteFrame";

/** The public site: navbar, the page as the main landmark, footer. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
