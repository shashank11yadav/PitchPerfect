"use client";

import type { RubricKey, TranscriptRole } from "@pitchperfect/shared";
import { useId, useState, type ReactNode } from "react";
import { ScoreRing } from "@/components/practice/ScoreRing";
import { cn } from "@/lib/cn";
export interface EvidenceRow {
  key: RubricKey;
  name: string;
  score: number;
  justification: string;
  evidence: string | null;
}

interface EvidenceExplorerData {
  rows: readonly EvidenceRow[];
  transcript: readonly { role: TranscriptRole; text: string }[];
  personaName: string;
  skillTitle: string;
  overall: number;
  weighted: RubricKey;
}

const MAX_SCORE = 5;

/** The line with the quoted words wrapped in a highlighter mark, or the line as it is. */
function marked(text: string, quote: string | null): ReactNode {
  const start = quote ? text.indexOf(quote) : -1;
  if (!quote || start < 0) return text;
  return (
    <>
      {text.slice(0, start)}
      <mark className="pp-mark">{quote}</mark>
      {text.slice(start + quote.length)}
    </>
  );
}

function Pips({ score }: { score: number }) {
  return (
    <span aria-hidden="true" className="flex gap-0.5">
      {Array.from({ length: MAX_SCORE }, (_, index) => (
        <span
          key={index}
          className={cn("h-1.5 w-3 rounded-pill", index < score ? "bg-primary" : "bg-border")}
        />
      ))}
    </span>
  );
}

/**
 * The sample scorecard as something to try: choose a rubric line and the transcript marks the
 * exact words that score is based on. Before scripts run it shows the practiced skill's line,
 * which is a complete, readable state on its own.
 */
export function EvidenceExplorerClient({
  rows,
  transcript,
  personaName,
  skillTitle,
  overall,
  weighted,
}: EvidenceExplorerData) {
  const [selected, setSelected] = useState<RubricKey>(weighted);
  const panelId = useId();
  const current = rows.find((row) => row.key === selected) ?? rows[0];
  if (!current) return null;

  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:gap-x-6">
      <div className="lg:col-span-4">
        <div className="flex items-center gap-5">
          <ScoreRing score={overall} />
          <p className="max-w-[22ch] text-small text-ink">
            {skillTitle} counts double here, because it&apos;s the skill being practiced.
          </p>
        </div>
        <ul aria-label="Rubric scores" className="mt-8 flex flex-wrap gap-2 lg:flex-col lg:gap-1">
          {rows.map((row) => {
            const active = row.key === selected;
            return (
              <li key={row.key}>
                <button
                  type="button"
                  aria-pressed={active}
                  aria-controls={panelId}
                  onClick={() => {
                    setSelected(row.key);
                  }}
                  className={cn(
                    "pp-press flex min-h-11 w-full items-center gap-3 rounded-pill px-4 text-left text-small font-semibold lg:rounded-control",
                    active ? "bg-navy text-white" : "bg-surface-2 text-ink hover:bg-primary-soft",
                  )}
                >
                  <span className="flex-1">{row.name}</span>
                  <span className="hidden lg:block">
                    <Pips score={row.score} />
                  </span>
                  <span className="tabular-nums">
                    {row.score}/{MAX_SCORE}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div id={panelId} data-ui className="rounded-[20px] bg-surface-2 p-5 md:p-8 lg:col-span-8">
        <div aria-live="polite" className="max-w-[60ch]">
          <p className="font-display text-lede font-semibold text-navy">
            {current.name}, {current.score} out of {MAX_SCORE}
            {current.key === weighted && " (counts double)"}
          </p>
          <p className="mt-1 text-ink">{current.justification}</p>
          {!current.evidence && (
            <p className="mt-1 text-ink">
              This score is about the whole call, so there&apos;s no single line to mark.
            </p>
          )}
        </div>
        <ol aria-label="Sample transcript" className="mt-6 flex flex-col gap-4 md:mt-8">
          {transcript.map((entry) =>
            entry.role === "student" ? (
              <li key={entry.text} className="max-w-[58ch]">
                <span className="block text-small font-semibold text-primary">You</span>
                <span className="mt-0.5 block text-statement text-ink">
                  {marked(entry.text, current.evidence)}
                </span>
              </li>
            ) : (
              <li key={entry.text} className="max-w-[60ch] pl-0 md:pl-10">
                <span className="block text-small font-semibold text-ink">{personaName}</span>
                <span className="block text-ink">{entry.text}</span>
              </li>
            ),
          )}
        </ol>
      </div>
    </div>
  );
}
