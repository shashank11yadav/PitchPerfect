import type { Metadata, Viewport } from "next";
import { Manrope, Poppins } from "next/font/google";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { SkipLink } from "@/components/layout/SkipLink";
import { SITE_NAME, SITE_URL, TAGLINE } from "@/lib/site";
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
  "Practice sales conversations with an AI practice partner, get a scored rubric with clear feedback, and apply to entry-level sales jobs on PitchPerfect.";

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
  // Render every page per request so Next can stamp proxy.ts's CSP nonce on its scripts.
  await connection();
  return (
    <html lang="en" className={`${poppins.variable} ${manrope.variable}`}>
      <body className="min-h-dvh antialiased">
        <SkipLink />
        {children}
      </body>
    </html>
  );
}
