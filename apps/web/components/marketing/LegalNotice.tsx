import { Info } from "lucide-react";

/** The banner on the legal templates (docs/roadmap.md: legal pages are templates). */
export function LegalNotice() {
  return (
    <div role="note" className="flex gap-3 rounded-card bg-warning/10 p-5 text-ink">
      <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
      <p>
        <strong>Demo template — not legal advice.</strong> This page describes how the PitchPerfect
        software handles data. Anyone running it for real users should have it reviewed by a lawyer
        and adapted to their own service.
      </p>
    </div>
  );
}
