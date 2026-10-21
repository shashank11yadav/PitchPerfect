import { PageHero } from "@/components/marketing/Hero";
import { LegalDocument } from "@/components/marketing/LegalDocument";
import { LEGAL_UPDATED } from "@/content/legal";
import { privacySections } from "@/content/privacy";
import { practicePartnerKind } from "@/lib/practice-partner";
import { pageMetadata, PUBLIC_PAGES } from "@/lib/seo";

export const metadata = pageMetadata(PUBLIC_PAGES.privacy);

export default async function PrivacyPage() {
  const partner = await practicePartnerKind();
  return (
    <>
      <PageHero
        title="Privacy policy"
        lead={
          <p>
            What PitchPerfect collects, who processes it, how long it&apos;s kept, and how to delete
            it.
          </p>
        }
      />
      <LegalDocument updated={LEGAL_UPDATED} sections={privacySections(partner)} />
    </>
  );
}
