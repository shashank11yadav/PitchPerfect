import { Hero } from "@/components/marketing/Hero";
import { LegalDocument } from "@/components/marketing/LegalDocument";
import { LEGAL_UPDATED } from "@/content/legal";
import { TERMS_SECTIONS } from "@/content/terms";
import { pageMetadata, PUBLIC_PAGES } from "@/lib/seo";

export const metadata = pageMetadata(PUBLIC_PAGES.terms);

export default function TermsPage() {
  return (
    <>
      <Hero
        compact
        title="Terms of use"
        lead={<p>The rules for using PitchPerfect as a student or an employer.</p>}
      />
      <LegalDocument updated={LEGAL_UPDATED} sections={TERMS_SECTIONS} />
    </>
  );
}
