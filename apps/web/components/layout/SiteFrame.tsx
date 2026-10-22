import type { ReactNode } from "react";
import { DemoBanner } from "@/components/demo/DemoNotice";
import { PAGES_EXPORT } from "@/lib/pages-export";
import { Footer } from "./Footer";
import { Navbar } from "./Navbar";

/**
 * The public site's frame, shared by the marketing and auth pages: navbar, main, footer. The
 * static demo says what it is in one line above the bar.
 */
export function SiteFrame({ children }: { children: ReactNode }) {
  return (
    <>
      {PAGES_EXPORT && <DemoBanner />}
      <Navbar />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
