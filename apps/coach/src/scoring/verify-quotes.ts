import { LIMITS, type Scorecard } from "@pitchperfect/shared";
import { unescapeData } from "../prompts/blocks.js";

const MIN_QUOTE_WORDS = 3;
const WORD_CHAR = /[\p{L}\p{N}]/u;

/** Prompts carry NFKC-normalized text, so both sides are compared in that form. */
const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim();

/** Every sentence of every student turn, normalized, so each is a verbatim substring. */
export function studentSentences(turns: readonly string[]): string[] {
  return turns
    .map(normalize)
    .flatMap((turn) => turn.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

const isWordChar = (char: string | undefined) => char !== undefined && WORD_CHAR.test(char);

/** True when `quote` occurs in `turn` without starting or ending inside a word. */
function occursOnWordBoundaries(turn: string, quote: string): boolean {
  for (let at = turn.indexOf(quote); at >= 0; at = turn.indexOf(quote, at + 1)) {
    const cutsIn = isWordChar(turn[at - 1]) && isWordChar(quote[0]);
    const cutsOut = isWordChar(turn[at + quote.length]) && isWordChar(quote.at(-1));
    if (!cutsIn && !cutsOut) return true;
  }
  return false;
}

/**
 * Keeps only quotes the student actually said: `evidence` must be at least three words and a
 * whole-word, verbatim substring of a student turn after normalization, else it becomes null; a
 * `strongerLine.original` that fails the same test is replaced by the longest student sentence.
 * The model saw escaped text, so a quote is tried unescaped first, then as written.
 */
export function verifyQuotes(scorecard: Scorecard, studentTurns: readonly string[]): Scorecard {
  const sentences = studentSentences(studentTurns);
  const longest = sentences.reduce((best, s) => (s.length > best.length ? s : best), "");
  if (longest === "") throw new RangeError("Cannot verify quotes without a student sentence");

  const turns = studentTurns.map(normalize);
  const said = (candidate: string) =>
    candidate.split(" ").length >= MIN_QUOTE_WORDS &&
    turns.some((turn) => occursOnWordBoundaries(turn, candidate));
  const verbatim = (quote: string | null): string | null => {
    if (quote === null) return null;
    const candidates = [normalize(unescapeData(quote)), normalize(quote)];
    return candidates.find(said) ?? null;
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
