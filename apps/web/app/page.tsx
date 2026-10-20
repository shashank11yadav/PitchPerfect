import type { Metadata } from "next";
import { TAGLINE } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <main id="main" className="flex min-h-dvh items-center bg-linear-to-b from-navy to-navy-900">
      <section className="mx-auto w-full max-w-content px-4 py-12 text-center sm:px-6 md:py-20">
        <h1 className="text-display-sm text-white md:text-display">
          Sharpen your sales pitch with an AI practice partner
        </h1>
        <p className="mt-6 text-h4 text-white/85">{TAGLINE}</p>
      </section>
    </main>
  );
}
