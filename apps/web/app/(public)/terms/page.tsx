import { PageHero } from "@/components/marketing/Hero";
import { LegalDocument } from "@/components/marketing/LegalDocument";
import { LEGAL_UPDATED } from "@/content/legal";
import { termsSections } from "@/content/terms";
import { practicePartnerKind } from "@/lib/practice-partner";
import { pageMetadata, PUBLIC_PAGES } from "@/lib/seo";

export const metadata = pageMetadata(PUBLIC_PAGES.terms);

export default async function TermsPage() {
  const partner = await practicePartnerKind();
  return (
    <>
      <PageHero
        title="Terms of use"
        lead={
          <p>
            {partner === "browser"
              ? "The rules for using this demo of PitchPerfect."
              : "The rules for using PitchPerfect as a student or an employer."}
          </p>
        }
      />
      <LegalDocument updated={LEGAL_UPDATED} sections={termsSections(partner)} />
    </>
  );
}
