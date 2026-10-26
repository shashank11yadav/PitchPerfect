import type { Metadata, Viewport } from "next";
import { Manrope, Poppins } from "next/font/google";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { SkipLink } from "@/components/layout/SkipLink";
import { PAGES_EXPORT, STATIC_CSP } from "@/lib/pages-export";
import { SessionProvider } from "@/lib/session";
import { hasSessionCookie, SITE_NAME, SITE_URL, TAGLINE } from "@/lib/site";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-heading",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-body",
});

const DESCRIPTION =
  "Practice sales conversations with a partner that plays the buyer, get a scored rubric with clear feedback, and apply to entry-level sales jobs on PitchPerfect.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} · ${TAGLINE}`, template: `%s · ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#3f56d2",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  let hasSession = false;
  if (!PAGES_EXPORT) {
    // Render every page per request so Next can stamp proxy.ts's CSP nonce on its scripts.
    await connection();
    // Without the session cookie nobody is signed in, so the page renders signed-out on the server
    // and never asks the api. With it, the session may still be valid: `/auth/me` decides.
    hasSession = hasSessionCookie(await cookies());
  }
  return (
    <html lang="en" className={`${poppins.variable} ${manrope.variable}`}>
      {/* A static host sets no headers, so the export carries its policy in the document. */}
      {PAGES_EXPORT && <meta httpEquiv="Content-Security-Policy" content={STATIC_CSP} />}
      <body className="min-h-dvh antialiased">
        <SkipLink />
        <SessionProvider initialStatus={hasSession ? "loading" : "signed_out"}>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
