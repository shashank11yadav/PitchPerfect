import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { LegalNotice } from "./LegalNotice";
import { WRAP } from "./Section";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

interface LegalDocumentProps {
  /** e.g. "October 20, 2026". */
  updated: string;
  sections: readonly LegalSection[];
}

/** A legal template: the notice, a table of contents, and the numbered sections. */
export function LegalDocument({ updated, sections }: LegalDocumentProps) {
  return (
    <div className="bg-surface py-14 md:py-24">
      <div className={cn(WRAP, "grid gap-10 lg:grid-cols-12 lg:gap-x-6")}>
        <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:col-span-3 lg:self-start">
          <h2 className="text-small font-bold text-ink">On this page</h2>
          <ol className="mt-3 flex flex-col gap-1.5 text-small">
            {sections.map(({ id, title }) => (
              <li key={id}>
                <a href={`#${id}`} className="pp-link rounded-control text-ink">
                  {title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="min-w-0 max-w-prose lg:col-span-8 lg:col-start-5">
          <LegalNotice />
          <p className="mt-6 text-small text-ink">Last updated {updated}</p>
          {sections.map(({ id, title, body }) => (
            <section key={id} aria-labelledby={id} className="mt-10">
              <h2 id={id} className="scroll-mt-24 text-h3 text-navy">
                {title}
              </h2>
              <div className="pp-prose mt-4">{body}</div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
