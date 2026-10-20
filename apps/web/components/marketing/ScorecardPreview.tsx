import { ScorecardDetails } from "@/components/practice/ScorecardDetails";
import {
  SAMPLE_PERSONA,
  SAMPLE_SCORECARD,
  SAMPLE_SKILL_TITLE,
  SAMPLE_WEIGHTED,
} from "./sample-session";

/** The sample session's scorecard, laid out like the real one. */
export function ScorecardPreview() {
  return (
    <article
      aria-labelledby="sample-scorecard-title"
      className="overflow-hidden rounded-[20px] bg-surface text-ink"
    >
      <header
        data-ui
        className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 md:px-8"
      >
        <div>
          <p className="text-caption font-semibold text-muted">Sample scorecard</p>
          <h3 id="sample-scorecard-title" className="text-h4">
            {SAMPLE_SKILL_TITLE} with {SAMPLE_PERSONA.personaName}
          </h3>
        </div>
        <p className="text-small text-muted">Fictional session, real rubric</p>
      </header>

      <ScorecardDetails
        scorecard={SAMPLE_SCORECARD}
        skillTitle={SAMPLE_SKILL_TITLE}
        weighted={SAMPLE_WEIGHTED}
      />
    </article>
  );
}
