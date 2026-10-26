import type { ScenarioPrivate } from "@pitchperfect/shared";
import { canonical, padded, plainWords, readingsOf, wordsOf, type Readings } from "./canonical.js";

const SHINGLE_WORDS = 6;
const MIN_CONTENT_WORDS = 3;
/** Words in a key phrase of the hidden scenario, and the content words it needs. */
const KEY_WORDS = 4;
const MIN_KEY_CONTENT_WORDS = 2;
/** A key phrase or token is looked for in spelled-out letters only from this length. */
const MIN_SPELLED_LETTERS = 5;

/** Words that never mark a phrase as coming from the instructions on their own. */
const STOPWORDS = new Set(
  (
    "a an the and or but if then so to of in on at for with from by as is are was were be been " +
    "it its this that these those i me my you your we our they them their he she his her us " +
    "what which who when where why how do does did have has had will would can could should " +
    "not no just very all any some only than too up out about into over other s ll re ve d t m"
  ).split(" "),
);

/**
 * Instruction vocabulary a persona never needs, matched as whole words after "my" or "your" so
 * ordinary talk ("win conditions are tough", "our system prompts nurses") stays clean.
 */
const MARKER = /\b(?:my|your) (?:hidden objections?|win conditions?|system prompts?)\b/;
/** The scenario's own labels heading a list: "Hidden objections: …". */
const LABEL = /(?:^|[.!?\n]\s*)(?:hidden objections?|win conditions?)\s*:/;
const RAW_MARKERS = ["[task:"];

/**
 * Shingles never span these: sentence ends, line breaks, and "AI practice partner", which the
 * persona is told to say when sincerely asked.
 */
const SEGMENT_BREAK = /(?<=[.!?])\s+|\n+|\bAI practice partner\b/gi;

const contentWords = (words: readonly string[]) =>
  words.filter((word) => !STOPWORDS.has(word)).length;

/** Every `size`-word run of `words` with at least `minContent` content words. */
function runsOf(words: readonly string[], size: number, minContent: number): string[][] {
  const runs: string[][] = [];
  for (let i = 0; i + size <= words.length; i += 1) {
    const run = words.slice(i, i + size);
    if (contentWords(run) >= minContent) runs.push(run);
  }
  return runs;
}

/**
 * Phrases a reply must never contain: matched as whole words in every worded reading and as run-on
 * letters in every spelled one.
 */
function phraseCheck(phrases: readonly (readonly string[])[]): (readings: Readings) => boolean {
  const byLength = new Map<number, Set<string>>();
  for (const phrase of phrases) {
    const set = byLength.get(phrase.length) ?? new Set<string>();
    set.add(phrase.join(" "));
    byLength.set(phrase.length, set);
  }
  const letters = phrases.map((phrase) => phrase.join(""));
  return ({ worded, spelled }) =>
    worded.some((reading) => {
      const words = wordsOf(reading);
      for (const [size, set] of byLength) {
        for (let i = 0; i + size <= words.length; i += 1) {
          if (set.has(words.slice(i, i + size).join(" "))) return true;
        }
      }
      return false;
    }) || spelled.some((reading) => letters.some((phrase) => reading.includes(phrase)));
}

/** Instruction vocabulary or a scenario label in any worded reading. */
const hasMarker = ({ worded }: Readings) =>
  worded.some(
    (reading) =>
      RAW_MARKERS.some((marker) => reading.includes(marker)) ||
      LABEL.test(reading) ||
      MARKER.test(wordsOf(reading).join(" ")),
  );

/**
 * Builds a check for replies that recite the instructions: any 6-word run within one sentence of
 * `instructions` (with at least three content words), or a marker phrase. It reads the reply every
 * way a trick could hide them (see `readingsOf`): case, punctuation, separators, look-alike
 * letters, leetspeak, reversed text, and base64, hex or percent-encoded runs are all seen through.
 */
export function createLeakScanner(instructions: string): (reply: string) => boolean {
  const shingles = instructions
    .split(SEGMENT_BREAK)
    .flatMap((segment) => runsOf(wordsOf(canonical(segment)), SHINGLE_WORDS, MIN_CONTENT_WORDS));
  const recites = phraseCheck(shingles);
  return (reply) => {
    const readings = readingsOf(reply);
    return hasMarker(readings) || recites(readings);
  };
}

/** A key phrase of the hidden scenario: canonical words to look for, plain words a reader sees. */
interface KeyPhrase {
  canonical: string;
  letters: string;
  plain: string;
}

function keyPhrases(entry: string): KeyPhrase[] {
  const words = wordsOf(canonical(entry));
  const plain = wordsOf(plainWords(entry));
  // An entry the canonical form splits differently from the plain one has no safe plain match.
  if (words.length !== plain.length) return [];
  const size = Math.min(KEY_WORDS, words.length);
  const phrases: KeyPhrase[] = [];
  for (let i = 0; i + size <= words.length; i += 1) {
    const run = words.slice(i, i + size);
    if (size === KEY_WORDS && contentWords(run) < MIN_KEY_CONTENT_WORDS) continue;
    phrases.push({
      canonical: padded(run),
      letters: run.join(""),
      plain: padded(plain.slice(i, i + size)),
    });
  }
  return phrases;
}

/**
 * Names and figures in the hidden scenario ("Routewise", "Q3"): a capitalised word after the first
 * one, or any word with a digit.
 */
function distinctiveTokens(entry: string): KeyPhrase[] {
  return entry
    .split(SEGMENT_BREAK)
    .flatMap((sentence) => wordsOf(sentence).slice(1))
    .filter((word) => word !== "I" && (/^\p{Lu}/u.test(word) || /\d/.test(word)))
    .map((word) => {
      const folded = canonical(word);
      return { canonical: ` ${folded} `, letters: folded, plain: plainWords(word) };
    });
}

/**
 * In some reading of the reply (`words` holds each worded reading as padded words), but not plainly
 * said in it: it was hidden with a trick.
 */
function hidden(
  phrase: KeyPhrase,
  { plain, spelled }: Readings,
  words: readonly string[],
): boolean {
  if (plain.includes(phrase.plain)) return false;
  return (
    words.some((reading) => reading.includes(phrase.canonical)) ||
    (phrase.letters.length >= MIN_SPELLED_LETTERS &&
      spelled.some((reading) => reading.includes(phrase.letters)))
  );
}

/** Said plainly: at least half of the objection's key phrases are in the reply word for word. */
function saidOutright(phrases: readonly KeyPhrase[], { plain }: Readings): boolean {
  const said = phrases.filter((phrase) => plain.includes(phrase.plain)).length;
  return phrases.length > 0 && said * 2 >= phrases.length;
}

/**
 * Builds a check for replies that give away the hidden part of the scenario. The persona raises
 * its objections out loud, one at a time, so an objection said plainly is fine; it never needs a
 * win condition. A reply leaks when:
 * - a 6-word run of a win condition (the whole of a shorter one), with at least three content
 *   words, appears in any reading;
 * - a key phrase (4 words) of any entry, or a name or figure in one, appears only through a trick:
 *   in some reading of the reply but not in what it plainly says;
 * - two or more objections are said outright in one reply: that is the list.
 */
export function createScenarioLeakScanner({
  hiddenObjections,
  winConditions,
}: ScenarioPrivate): (reply: string) => boolean {
  const recitesWin = phraseCheck(
    winConditions.flatMap((entry) => {
      const words = wordsOf(canonical(entry));
      return runsOf(words, Math.min(SHINGLE_WORDS, words.length), MIN_CONTENT_WORDS);
    }),
  );
  const entries = [...hiddenObjections, ...winConditions];
  const phrases = entries.flatMap(keyPhrases);
  const tokens = entries.flatMap(distinctiveTokens);
  const objections = hiddenObjections.map(keyPhrases);
  return (reply) => {
    const readings = readingsOf(reply);
    const words = readings.worded.map((reading) => padded(wordsOf(reading)));
    return (
      recitesWin(readings) ||
      [...phrases, ...tokens].some((phrase) => hidden(phrase, readings, words)) ||
      objections.filter((entry) => saidOutright(entry, readings)).length >= 2
    );
  };
}
