import type { ReactNode } from "react";
import { LegalNotice } from "./LegalNotice";

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
    <div className="bg-surface py-12 md:py-16">
      <div className="mx-auto grid max-w-content gap-10 px-4 sm:px-6 lg:grid-cols-[15rem_1fr] lg:gap-16">
        <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="text-small font-bold text-ink">On this page</h2>
          <ol className="mt-3 flex flex-col gap-1.5 text-small">
            {sections.map(({ id, title }) => (
              <li key={id}>
                <a href={`#${id}`} className="rounded-control text-ink hover:text-primary">
                  {title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="min-w-0 max-w-prose">
          <LegalNotice />
          <p className="mt-6 text-small text-ink">Last updated {updated}</p>
          {sections.map(({ id, title, body }) => (
            <section key={id} aria-labelledby={id} className="mt-10">
              <h2 id={id} className="scroll-mt-24 text-h3">
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
