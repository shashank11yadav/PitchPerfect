import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { JsonLd } from "@/components/ui/JsonLd";
import { faqJsonLd, type FaqItem } from "@/lib/seo";
import { Section, SectionHeading } from "./Section";

interface FaqProps {
  heading: string;
  lead?: ReactNode;
  items: readonly FaqItem[];
  tone?: "white" | "muted";
}

/**
 * Questions as native disclosures, so they open by keyboard and without JavaScript. Carries the
 * matching FAQPage structured data, which must describe questions visible on the page.
 */
export function Faq({ heading, lead, items, tone = "white" }: FaqProps) {
  return (
    <Section tone={tone} labelledBy="faq-heading">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
        <SectionHeading id="faq-heading" eyebrow="FAQ" title={heading} lead={lead} />
        <div className="divide-y divide-border rounded-card border border-border bg-surface shadow-card">
          {items.map(({ question, answer }) => (
            <details key={question} className="group px-5 md:px-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-control py-5 font-semibold text-ink hover:text-primary [&::-webkit-details-marker]:hidden">
                <span>{question}</span>
                <ChevronDown
                  aria-hidden="true"
                  className="size-5 shrink-0 text-primary transition-transform group-open:rotate-180"
                />
              </summary>
              <p className="pb-5 text-ink">{answer}</p>
            </details>
          ))}
        </div>
      </div>
      <JsonLd data={faqJsonLd(items)} />
    </Section>
  );
}
