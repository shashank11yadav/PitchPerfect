import {
  computeOverall,
  LIMITS,
  RUBRIC_DIMENSIONS,
  type RubricKey,
  type Scorecard,
} from "@pitchperfect/shared";
import { ACKNOWLEDGE, ASK, BENEFIT, TIME_PHRASE } from "./fake-patterns.js";

/**
 * The fake provider's scorer: simple text heuristics, written up the way a sales coach would say
 * them. Every quote is a verbatim slice of a student turn, and every number comes from the turns.
 */

type Score = 1 | 2 | 3 | 4 | 5;

interface Judgement {
  score: Score;
  justification: string;
  evidence: string | null;
  /** Said when this is one of the call's best dimensions; null when it isn't true enough. */
  strength: string | null;
  improvement: string;
  /**
   * The line to rewrite when this is the weakest dimension and has no quote of its own; null when
   * no other line is one this dimension can make stronger.
   */
  fallback: string | null;
  /**
   * A stronger version of `line`, aimed at what this dimension scored low on, or null when this
   * dimension has no stronger version of that kind of line.
   */
  rewrite: (line: string) => string | null;
}

/**
 * What a line does in the call: asks for the next step (the scorecard's own test for an ask), asks
 * a question, or says something.
 */
type LineKind = "ask" | "question" | "statement";

/** "1 question", "3 questions". */
export const plural = (count: number, word: string) =>
  `${String(count)} ${count === 1 ? word : `${word}s`}`;

const clamp = (value: number): Score => Math.min(5, Math.max(1, Math.round(value))) as Score;

/** Sentences are trimmed slices of a turn, so each one is a verbatim substring of it. */
const sentencesOf = (turn: string) =>
  turn
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

/** A sentence as a quote: whole if it fits, otherwise cut at the last word that fits. */
function quote(sentence: string): string {
  if (sentence.length <= LIMITS.evidenceMaxLength) return sentence;
  const room = sentence.slice(0, LIMITS.evidenceMaxLength + 1);
  const space = room.lastIndexOf(" ");
  const cut = space > 0 ? room.slice(0, space) : room.slice(0, LIMITS.evidenceMaxLength);
  return cut.replace(/[\s,;:]+$/, "");
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** A sentence without its closing punctuation, for building on. */
const bare = (sentence: string) => sentence.replace(/[.!?]+$/, "");

function kindOf(sentence: string): LineKind {
  if (ASK.test(sentence) || TIME_PHRASE.test(sentence)) return "ask";
  return sentence.includes("?") ? "question" : "statement";
}

/**
 * True when `improved` still does what `original` did: an ask still ends on an ask, a question
 * still ends on a question, and a statement still opens with a statement. A closing question
 * never comes back as an answer to pushback, and an answer never comes back as a question.
 */
export function keepsKind(original: string, improved: string): boolean {
  const kind = kindOf(original);
  const sentences = sentencesOf(improved);
  const end = kind === "statement" ? sentences[0] : sentences.at(-1);
  return end !== undefined && kindOf(end) === kind;
}

/** `line` lower-cased at the start, to follow on from a clause; "I" stays a capital. */
const followOn = (line: string) =>
  /^I\b/.test(line) ? line : line.charAt(0).toLowerCase() + line.slice(1);

/**
 * `extra` added to `line` without changing what the line does: after a statement, and before a
 * question or an ask, so the line still ends on it.
 */
const withLine = (line: string, extra: string) =>
  kindOf(line) === "statement" ? `${bare(line)}. ${extra}` : `${extra} ${line}`;

const OPEN_QUESTION = /^(what|how|why|which|where|who|tell me|walk me)\b/i;
const PROOF = /\b(\d+|for example|customers|teams like|case study|results)\b/i;
const YOU = /\b(you|your|yours)\b/i;
const HEDGES = [
  "um",
  "uh",
  "sorry",
  "i think",
  "i guess",
  "just",
  "maybe",
  "kind of",
  "sort of",
  "basically",
];
const HEDGE = new RegExp(`\\b(${HEDGES.join("|")})\\b`, "gi");
/** The same words, for `test`: a global pattern would carry `lastIndex` between calls. */
const HEDGE_ONE = new RegExp(HEDGE.source, "i");
const OPENER = /\b(hi|hello|my name|i'm|i am|thanks for)\b/i;

/** Below this many words a turn, the call was too terse to judge for clarity. */
const TERSE_WORDS = 4;
/** A single turn longer than this buries its point. */
const LONG_TURN_WORDS = 45;

const ASK_LINE = "Could we book 20 minutes on Thursday at 10am to go through it together?";
const DISCOVERY_LINE = "How do you handle that today, and what happens when it goes wrong?";

/** Picks sentences for evidence so no two dimensions quote the same line. */
function quoter() {
  const used = new Set<string>();
  return (...candidates: (string | undefined)[]): string | null => {
    const fresh = candidates.find(
      (candidate): candidate is string => candidate !== undefined && !used.has(candidate),
    );
    if (fresh === undefined) return null;
    used.add(fresh);
    return quote(fresh);
  };
}

/** "‘just’, ‘I think’" from the hedges actually used, in the student's own casing. */
function hedgeList(text: string): { count: number; list: string } {
  const found = text.match(HEDGE) ?? [];
  const distinct = [...new Set(found.map((hedge) => hedge.toLowerCase()))].slice(0, 3);
  return {
    count: found.length,
    list: distinct.map((hedge) => `‘${hedge.replace(/^i /, "I ")}’`).join(", "),
  };
}

/** The line with its hedges taken out and the first letter put back in capitals. */
function withoutHedges(line: string): string {
  const cleaned = line
    .replace(HEDGE, "")
    .replace(/\s+,/g, ",")
    .replace(/^[\s,]+/, "")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** The first clause of a long line, as its own sentence, ending the way the line did. */
function shortened(line: string): string {
  const words = bare(line).split(/\s+/);
  const clause =
    bare(line)
      .split(/,|\band\b|\bwhich\b/)[0]
      ?.trim() ?? "";
  const short = wordCount(clause) >= 4 ? clause : words.slice(0, 12).join(" ");
  return `${short}${line.includes("?") ? "?" : "."}`;
}

function judge(turns: readonly string[]): Record<RubricKey, Judgement> {
  const said = turns.flatMap((turn, index) =>
    sentencesOf(turn).map((sentence) => ({ sentence, turn: index })),
  );
  const sentences = said.map(({ sentence }) => sentence);
  const all = turns.join(" ");
  const take = quoter();
  const first = (pattern: RegExp) => sentences.find((sentence) => pattern.test(sentence));
  /** The first match after the opening turn: pushback and the ask come once the call is under way. */
  const later = (pattern: RegExp) =>
    said.find(({ sentence, turn }) => turn > 0 && pattern.test(sentence))?.sentence;
  /** How many turns say it at least once: saying it again in the same turn earns nothing more. */
  const turnsWith = (test: (sentence: string) => boolean) =>
    new Set(said.filter(({ sentence }) => test(sentence)).map(({ turn }) => turn)).size;
  const last = sentences.at(-1) ?? "";
  /** The last thing the student said rather than asked, for a rewrite that adds to it. */
  const lastStatement = sentences.findLast((sentence) => kindOf(sentence) === "statement");

  const questions = sentences.filter((sentence) => sentence.includes("?"));
  const open = questions.filter((sentence) => OPEN_QUESTION.test(sentence));
  const questionTurns = turnsWith((sentence) => sentence.includes("?"));
  const openTurns = turnsWith((sentence) => sentence.includes("?") && OPEN_QUESTION.test(sentence));
  // An ask phrased as a question is the call to action, not a closed discovery question.
  const closed = questions.find(
    (sentence) => !OPEN_QUESTION.test(sentence) && kindOf(sentence) === "question",
  );
  const averageWords = turns.length ? Math.round(wordCount(all) / turns.length) : 0;
  const longest = [...sentences].sort((a, b) => wordCount(b) - wordCount(a))[0] ?? "";
  const tidiest = sentences.find((sentence) => {
    const words = wordCount(sentence);
    return words >= 5 && words <= 18 && !sentence.includes("?");
  });
  const hedges = hedgeList(all);
  const hedged = first(HEDGE_ONE);
  const youTurns = turns.filter((turn) => YOU.test(turn)).length;
  const benefits = sentences.filter((sentence) => BENEFIT.test(sentence));
  const benefitTurns = turnsWith((sentence) => BENEFIT.test(sentence));
  const timed = first(TIME_PHRASE);
  const time = timed?.match(TIME_PHRASE)?.[0];
  const ask = timed ?? first(ASK);
  const askedLater = later(TIME_PHRASE) ?? later(ASK);
  const acknowledged = later(ACKNOWLEDGE);
  // Proof answers the concern just acknowledged: a fact after it, not a time or a number in an
  // ask. The rest of the acknowledging sentence counts ("I hear you, and one carrier cut $3,000").
  const isProof = (text: string) => PROOF.test(text) && !ASK.test(text) && !TIME_PHRASE.test(text);
  const ackMatch = acknowledged ? ACKNOWLEDGE.exec(acknowledged) : null;
  const ackRest =
    acknowledged && ackMatch ? acknowledged.slice(ackMatch.index + ackMatch[0].length) : "";
  const afterAcknowledging = acknowledged
    ? sentences.slice(sentences.indexOf(acknowledged) + 1)
    : [];
  const proof = isProof(ackRest) ? acknowledged : afterAcknowledging.find(isProof);
  const opener = OPENER.test(turns[0] ?? "") ? sentences[0] : undefined;

  // Structure first, so the opening line is its evidence and clarity quotes something else.
  const missing = [
    !opener && {
      reason: "You skipped the introduction, so they never heard who was calling or why.",
      fix: "Open with who you are and why you called, in one sentence.",
      rewrite: (line: string) => `Thanks for taking the call. ${line}`,
    },
    questions.length === 0 && {
      reason:
        "You pitched without asking anything first, so the pitch had nothing of theirs to hang on.",
      fix: "Ask one question about how they work today before you describe anything.",
      rewrite: (line: string) => withLine(line, DISCOVERY_LINE),
    },
    turns.length < 3 && {
      reason: `The call ended after ${plural(turns.length, "turn")}, before it could get anywhere.`,
      quote: last,
      fix: "Stay in the call longer: answer what they say and move it toward a decision.",
      rewrite: (line: string) => withLine(line, DISCOVERY_LINE),
    },
    !ask && {
      reason: "It ended without an ask, so there was nothing for them to agree to.",
      // Where the ask should have been.
      quote: last,
      fix: "Finish with a clear ask for the next meeting.",
      // A closing question stays a question, so only a closing statement gets the ask added.
      rewrite: (line: string) =>
        kindOf(line) === "statement" ? `${bare(line)}. ${ASK_LINE}` : null,
    },
    ask !== undefined &&
      askedLater === undefined && {
        reason:
          "You asked for the meeting in your first turn, before they had a reason to say yes.",
        quote: ask,
        fix: "Make the ask at the end, once they've told you what matters to them.",
        // Still the ask, now earned by what they've said.
        rewrite: (line: string) =>
          kindOf(line) === "ask"
            ? `Once I've heard how you handle it today, ${followOn(line)}`
            : null,
      },
  ].filter((part) => part !== false);
  const structureScore = clamp(5 - missing.length);

  const longestTurn = Math.max(0, ...turns.map(wordCount));
  /** One long turn buries its point even when the others are short. */
  const longNote =
    longestTurn > LONG_TURN_WORDS ? `, and the longest ran to ${String(longestTurn)}` : "";
  /** Turns of a word or two say too little to be clear or unclear. */
  const terse = averageWords > 0 && averageWords < TERSE_WORDS;
  const clarityScore: Score =
    averageWords === 0
      ? 1
      : terse
        ? 2
        : clamp(
            5 -
              [25, 40, 60, 90].filter((limit) => averageWords > limit).length -
              Number(longestTurn > LONG_TURN_WORDS),
          );
  /** A tidy sentence shows a clear call; the longest one shows a rambling call. */
  const clarityPick = clarityScore >= 4 ? (tidiest ?? longest) : longest;

  // Quotes are handed out most telling first: on a rambling call its longest line, then the
  // ask, a question, the pushback answer, a benefit, the opening, a hedge or a steady line, and
  // what's left for clarity.
  const rambled = clarityScore <= 3 && !terse ? take(clarityPick) : null;
  const quotes = {
    cta: take(ask),
    discovery: take(...open, ...questions),
    objections: take(acknowledged),
    value: take(...benefits),
    structure: missing[0]?.quote ? take(missing[0].quote) : take(opener, sentences[0]),
    confidence: null as string | null,
    clarity: null as string | null,
  };
  const steady = sentences.filter(
    (sentence) => !HEDGE_ONE.test(sentence) && sentence !== clarityPick,
  );
  quotes.confidence = hedged ? take(hedged) : take(...steady, clarityPick);
  quotes.clarity = rambled ?? take(clarityPick, ...sentences);

  const clarity: Judgement = {
    score: clarityScore,
    justification: terse
      ? "Your turns were a word or two each, too short to carry a point. Say why you called in a full sentence."
      : clarityScore >= 4
        ? `Your turns ran about ${plural(averageWords, "word")}, short enough that each one landed as one point.`
        : clarityScore === 3
          ? `Your turns ran about ${plural(averageWords, "word")}${longNote}. Cut each one down to a single point and it would land harder.`
          : `Your turns ran about ${plural(averageWords, "word")}${longNote}, so the main point got buried. Say the one thing you want remembered, then stop.`,
    evidence: quotes.clarity,
    strength:
      clarityScore >= 4
        ? `Your turns stayed short, about ${plural(averageWords, "word")} each.`
        : null,
    improvement: terse
      ? "Give every turn one full point: who you are, what you noticed, or a question."
      : clarityScore >= 4
        ? "Keep your turns this short when the call gets harder."
        : `Keep each turn to one point. Yours ran about ${plural(averageWords, "word")}.`,
    fallback: longest,
    rewrite: shortened,
  };

  const valueScore = clamp(
    1 + Math.min(2, benefitTurns) + Number(youTurns >= 2) + Number(youTurns >= 4),
  );
  const value: Judgement = {
    score: valueScore,
    justification:
      valueScore >= 4
        ? `You talked about them, with “you” and “your”, in ${plural(youTurns, "turn")} and named what would get better for them.`
        : benefits.length > 0
          ? `You named ${benefits.length === 1 ? "a benefit" : plural(benefits.length, "benefit")}, but in your terms. Tie it to something they told you, so it's about their problem.`
          : "You described what you do, not what they'd get. Name one thing that changes for them.",
    evidence: quotes.value,
    strength: valueScore >= 4 ? "You framed it around what they'd get, not what you sell." : null,
    improvement: "Name one thing that gets better for them, in the words they used.",
    // The line where they said what they do, which is where the benefit belongs.
    fallback:
      sentences.find(
        (sentence) =>
          kindOf(sentence) === "statement" && sentence !== opener && wordCount(sentence) >= 6,
      ) ??
      sentences[0] ??
      last,
    rewrite: (line) =>
      kindOf(line) === "statement" ? `${bare(line)}. What would that be worth to your team?` : null,
  };

  const structure: Judgement = {
    score: structureScore,
    justification:
      missing[0]?.reason ??
      "The call had a clear opening, questions in the middle and an ask at the end.",
    evidence: quotes.structure,
    strength:
      missing.length === 0 ? "The call had a beginning, a middle and an ask, in that order." : null,
    improvement: missing[0]?.fix ?? "Sum up what you heard before you make the ask.",
    // The line the reason is about, even when another dimension quotes it.
    fallback: missing[0]?.quote ?? sentences[0] ?? last,
    // Nothing missing: sum up before the ask, or end a statement on one.
    rewrite:
      missing[0]?.rewrite ??
      ((line) => {
        const kind = kindOf(line);
        if (kind === "question") return null;
        return kind === "ask"
          ? `From what you've told me, it's worth a closer look. ${line}`
          : `${bare(line)}. ${ASK_LINE}`;
      }),
  };

  const discoveryScore = clamp(1 + questionTurns + Math.min(1, openTurns) - (openTurns ? 0 : 1));
  const discovery: Judgement = {
    score: discoveryScore,
    justification:
      questions.length === 0
        ? "You didn't ask a single question. Even one, like how they handle it today, changes the call."
        : open.length === 0
          ? `You asked ${plural(questions.length, "question")}, but ${questions.length === 1 ? "it" : "each one"} could be answered with yes or no. Start with how or what to get them talking.`
          : discoveryScore >= 4
            ? `You asked ${plural(questions.length, "question")}, ${open.length === questions.length ? "all of them open" : `${String(open.length)} of them open`}, and let them do the talking.`
            : `You asked ${plural(questions.length, "question")} and one was open. Follow the good one up with what the problem costs them.`,
    evidence: quotes.discovery,
    strength:
      open.length > 0
        ? `You asked ${plural(open.length, "open question")} and let them answer.`
        : null,
    improvement:
      open.length === 0
        ? "Ask how they handle it today before you pitch anything."
        : "After a good answer, ask what the problem costs them.",
    fallback: closed ?? lastStatement ?? last,
    // A question becomes an open one; a statement gets one after it; an ask stays the ask.
    rewrite: (line) => {
      const kind = kindOf(line);
      if (kind === "question") return DISCOVERY_LINE;
      return kind === "statement" ? `${bare(line)}. ${DISCOVERY_LINE}` : null;
    },
  };

  const objectionsScore = clamp(
    1 + (acknowledged ? 2 : 0) + (proof ? 1 : 0) + (acknowledged && proof && open.length ? 1 : 0),
  );
  const objections: Judgement = {
    score: objectionsScore,
    justification: acknowledged
      ? proof
        ? "When they pushed back, you agreed it was fair before answering, and you backed it up with something concrete."
        : "You acknowledged the pushback, which keeps them talking. Add one fact or result next time so the answer has weight."
      : "No line shows you acknowledging their pushback. When it comes, say it's fair, ask what's behind it, then answer with one fact.",
    evidence: quotes.objections,
    strength: acknowledged
      ? "You took the pushback calmly and said it was fair before answering."
      : null,
    improvement:
      "When they push back, say it's fair, ask what's behind it, then answer with one fact.",
    // Only the line that answered pushback can become a better answer to it. Without one, a
    // pitch or a closing ask rewritten as an objection reply would make no sense.
    fallback: null,
    rewrite: (line) =>
      kindOf(line) === "statement"
        ? "That's a fair concern. Can I ask what's behind it before I answer?"
        : null,
  };

  const confidenceScore = clamp(5 - hedges.count);
  const confidence: Judgement = {
    score: confidenceScore,
    justification:
      hedges.count === 0
        ? "No hedging or filler. You said what you meant and stopped."
        : `You hedged ${plural(hedges.count, "time")} (${hedges.list}). Drop ${hedges.count === 1 ? "it" : "them"} and the same lines sound certain.`,
    evidence: quotes.confidence,
    strength: hedges.count === 0 ? "No hedging. Your lines sounded sure of themselves." : null,
    improvement:
      hedges.count === 0
        ? "Keep the same steady tone when they push back."
        : `Cut the hedges (${hedges.list}). They make good points sound unsure.`,
    fallback: sentences[0] ?? last,
    rewrite: withoutHedges,
  };

  const ctaScore: Score = timed ? 5 : ask ? 3 : 1;
  const cta: Judgement = {
    score: ctaScore,
    justification: timed
      ? `You asked for a specific time, ${time ?? "a set day"}, so all they had to do was say yes.`
      : ask
        ? "You asked for a next step but left the time open. Offer a day and a time so it's easy to agree."
        : "You never asked for anything, so the call ended without a next step. Ask for a meeting before you hang up.",
    evidence: quotes.cta,
    strength: timed
      ? `You asked for a specific time: ${time ?? "a set day"}.`
      : ask
        ? "You asked for a next step."
        : null,
    improvement: timed
      ? "Ask who else should be in that meeting."
      : ask
        ? "Put a day and a time on your ask."
        : "End with a clear ask for a meeting.",
    fallback: lastStatement ?? last,
    rewrite: (line) => {
      const kind = kindOf(line);
      if (kind === "question") return null;
      if (kind === "statement") return `${bare(line)}. ${ASK_LINE}`;
      return TIME_PHRASE.test(line)
        ? `${bare(line)}, and could you bring whoever else would need to sign off?`
        : `${bare(line)}, on Thursday at 10am?`;
    },
  };

  return capped(
    { clarity, value, structure, discovery, objections, confidence, cta },
    turns.length,
  );
}

/** A reason with a note added, shortened to its first sentence (or dropped) if both don't fit. */
function withNote(reason: string, note: string): string {
  for (const text of [`${reason} ${note}`, `${sentencesOf(reason)[0] ?? ""} ${note}`]) {
    if (text.length <= LIMITS.justificationMaxLength) return text;
  }
  return note;
}

/**
 * A call of a few turns can't show much, however well each line is written: no dimension scores
 * above one more than the number of turns, and a capped one says so.
 */
function capped(judged: Record<RubricKey, Judgement>, turns: number): Record<RubricKey, Judgement> {
  const cap = clamp(1 + turns);
  const note = `Capped at ${String(cap)}: ${plural(turns, "turn")} is too short a call to show more.`;
  const fit = (judgement: Judgement): Judgement =>
    judgement.score <= cap
      ? judgement
      : { ...judgement, score: cap, justification: withNote(judgement.justification, note) };
  return {
    clarity: fit(judged.clarity),
    value: fit(judged.value),
    structure: fit(judged.structure),
    discovery: fit(judged.discovery),
    objections: fit(judged.objections),
    confidence: fit(judged.confidence),
    cta: fit(judged.cta),
  };
}

/** The turns with repeats dropped: a line said twice is one turn's worth of credit. */
function distinctTurns(turns: readonly string[]): string[] {
  const seen = new Set<string>();
  return turns.filter((turn) => {
    const key = turn.trim().replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** A stronger version of `line` of the same kind, when no dimension has one of its own. */
function lastResort(line: string): string {
  const kind = kindOf(line);
  if (kind === "statement") return `${bare(line)}. ${ASK_LINE}`;
  return kind === "ask" ? ASK_LINE : DISCOVERY_LINE;
}

/** True things to say about any call the student kept going. */
const FALLBACK_STRENGTHS = [
  "You got the conversation started and kept it going.",
  "You stayed on the call to the end.",
  "You kept your turns about the call.",
];

/**
 * A rubric-shaped scorecard from simple text heuristics; quotes come only from `turns`. Credit
 * comes from distinct turns, so piling keywords into one line or repeating a line adds nothing.
 */
export function heuristicScorecard(said: readonly string[], weighted: RubricKey): Scorecard {
  const turns = distinctTurns(said);
  const judged = judge(turns);
  const dimensions = RUBRIC_DIMENSIONS.map(({ key }) => {
    const { score, justification, evidence } = judged[key];
    return { key, score, justification, evidence };
  });
  const byScore = [...RUBRIC_DIMENSIONS].map(({ key }) => key);
  // Among equal scores, the specific things a student did make better praise than general ones.
  const praiseOrder: RubricKey[] = [
    "cta",
    "discovery",
    "objections",
    "value",
    "clarity",
    "confidence",
    "structure",
  ];
  const best = [...praiseOrder].sort((a, b) => judged[b].score - judged[a].score);
  // Lowest first; among equals, one with a quote, so the rewrite works on a real line.
  const worst = [...byScore].sort(
    (a, b) =>
      judged[a].score - judged[b].score ||
      Number(judged[b].evidence !== null) - Number(judged[a].evidence !== null),
  );

  const strengths = [
    ...best.flatMap((key) => (judged[key].strength ? [judged[key].strength] : [])),
    ...FALLBACK_STRENGTHS,
  ].slice(0, LIMITS.scorecardListSize);
  const improvements = worst
    .map((key) => judged[key].improvement)
    .filter((line, index, lines) => lines.indexOf(line) === index)
    .slice(0, LIMITS.scorecardListSize);

  // The weakest dimension that has a stronger version of its line, so the rewrite answers the
  // lowest score it can: its quote when it has one (equal scores put a quoted one first),
  // otherwise its fallback line from the student's turns. The stronger version does what the
  // line did, so a closing ask stays an ask and only becomes a better one.
  const lineOf = (judgement: Judgement) =>
    judgement.evidence ??
    (judgement.fallback === null ? null : quote(judgement.fallback || (turns[0] ?? "")));
  const rewrites = worst.flatMap((key) => {
    const line = lineOf(judged[key]);
    if (!line) return [];
    const rewritten = judged[key].rewrite(line);
    return rewritten && rewritten !== line && keepsKind(line, rewritten)
      ? [{ original: line, improved: rewritten }]
      : [];
  });
  const original =
    rewrites[0]?.original ??
    worst.map((key) => lineOf(judged[key])).find((line) => line !== null) ??
    "";
  const improved = rewrites[0]?.improved ?? lastResort(original);

  return {
    overall: computeOverall(dimensions, weighted),
    dimensions,
    strengths,
    improvements,
    strongerLine: original
      ? { original, improved: improved.slice(0, LIMITS.transcriptEntryMaxLength) }
      : { original: "No student turns.", improved: ASK_LINE },
  };
}
