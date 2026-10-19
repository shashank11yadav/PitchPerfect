import { LIMITS, type Scorecard } from "@pitchperfect/shared";

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/** Prompts escape angle brackets, so a model may quote them escaped. */
const unescape = (text: string) => text.replaceAll("&lt;", "<").replaceAll("&gt;", ">");

/** Every sentence of every student turn, whitespace-normalized, so each is a verbatim substring. */
export function studentSentences(turns: readonly string[]): string[] {
  return turns
    .map(normalize)
    .flatMap((turn) => turn.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * Keeps only quotes the student actually said: `evidence` must be a verbatim substring of a
 * student turn after whitespace normalization, else it becomes null; a `strongerLine.original`
 * that is not verbatim is replaced by the longest student sentence.
 */
export function verifyQuotes(scorecard: Scorecard, studentTurns: readonly string[]): Scorecard {
  const sentences = studentSentences(studentTurns);
  const longest = sentences.reduce((best, s) => (s.length > best.length ? s : best), "");
  if (longest === "") throw new RangeError("Cannot verify quotes without a student sentence");

  const turns = studentTurns.map(normalize);
  const verbatim = (quote: string | null): string | null => {
    if (quote === null) return null;
    const candidate = normalize(unescape(quote));
    return candidate !== "" && turns.some((turn) => turn.includes(candidate)) ? candidate : null;
  };

  return {
    ...scorecard,
    dimensions: scorecard.dimensions.map((d) => ({ ...d, evidence: verbatim(d.evidence) })),
    strongerLine: {
      ...scorecard.strongerLine,
      original:
        verbatim(scorecard.strongerLine.original) ??
        longest.slice(0, LIMITS.transcriptEntryMaxLength),
    },
  };
}
