import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { JsonLd } from "@/components/ui/JsonLd";
import { faqJsonLd, type FaqItem } from "@/lib/seo";
import { Section, SectionTitle } from "./Section";

interface FaqProps {
  heading: string;
  lead?: ReactNode;
  items: readonly FaqItem[];
  ground?: "white" | "soft";
}

/**
 * A wide heading with the questions indented under it. Native disclosures, so they open by
 * keyboard and without JavaScript; an open question sits on a tile of the soft tint. Carries the
 * matching FAQPage structured data, which must describe questions visible on the page.
 */
export function Faq({ heading, lead, items, ground = "white" }: FaqProps) {
  const tile = ground === "soft" ? "open:bg-surface" : "open:bg-primary-soft";
  return (
    <Section ground={ground} labelledBy="faq-heading">
      <SectionTitle id="faq-heading" size="title" className="max-w-[14ch]">
        {heading}
      </SectionTitle>
      <div className="mt-12 grid gap-y-8 md:mt-20 lg:grid-cols-12 lg:gap-x-6">
        {lead && <div className="text-ink lg:col-span-3">{lead}</div>}
        <div className="flex flex-col gap-2 lg:col-span-8 lg:col-start-5">
          {items.map(({ question, answer }) => (
            <details
              key={question}
              className={`group -mx-4 rounded-card px-4 md:-mx-6 md:px-6 ${tile}`}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-control py-5 text-lede font-semibold text-navy hover:text-primary md:text-statement [&::-webkit-details-marker]:hidden">
                <span>{question}</span>
                <ChevronDown
                  aria-hidden="true"
                  strokeWidth={2}
                  className="size-6 shrink-0 text-primary transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <p className="max-w-[56ch] pb-6 text-lede text-ink">{answer}</p>
            </details>
          ))}
        </div>
      </div>
      <JsonLd data={faqJsonLd(items)} />
    </Section>
  );
}
