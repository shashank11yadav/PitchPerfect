import {
  computeOverall,
  LIMITS,
  RUBRIC_DIMENSIONS,
  type RubricKey,
  type Scorecard,
} from "@pitchperfect/shared";

type Score = 1 | 2 | 3 | 4 | 5;
interface Judgement {
  score: Score;
  justification: string;
  evidence: string | null;
}

const clamp = (value: number): Score => Math.min(5, Math.max(1, Math.round(value))) as Score;

/** Sentences are trimmed slices of a turn, so each one is a verbatim substring of it. */
const sentencesOf = (turn: string) =>
  turn
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const quote = (sentence: string | undefined) =>
  sentence === undefined ? null : sentence.slice(0, LIMITS.evidenceMaxLength).trimEnd();

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

const DATED_ASK =
  /\b(monday|tuesday|wednesday|thursday|friday|tomorrow|next week|next month|this week|\d{1,2}(:\d{2})?\s?(am|pm)|\d{1,2}:\d{2})\b/i;
const ASK =
  /\b(meet|meeting|call|demo|next step|follow up|schedule|book|introduce|introduction|trial)\b/i;
const OPEN_QUESTION = /^(what|how|why|which|tell me|walk me)\b/i;
const ACKNOWLEDGE =
  /\b(understand|fair|makes sense|hear you|good question|great question|i see)\b/i;
const PROOF = /\b(\d+|for example|customers|teams like|case study|results)\b/i;
const BENEFIT = /\b(save|saves|reduce|cut|grow|increase|faster|less|help|helps)\b/i;
const YOU = /\b(you|your|yours)\b/gi;
const FILLER = /\b(um|uh|er|maybe|sorry|i think|i guess|just|kind of|sort of|basically)\b/gi;
const OPENER = /\b(hi|hello|my name|i'm|i am|thanks for)\b/i;

const IMPROVED_LINES: Record<RubricKey, string> = {
  clarity: "In one line: we cut the time your team spends on scheduling by half.",
  value: "Since you said bookings eat your mornings, this gives your team those hours back.",
  structure: "Let me share why I called, ask a couple of questions, and then suggest a next step.",
  discovery: "What happens today when a booking goes wrong, and what does that cost your team?",
  objections: "That's fair. Teams your size felt the same, and saw the cost back within a quarter.",
  confidence: "We help teams like yours save four hours a week on scheduling.",
  cta: "Could we book twenty minutes next Tuesday at 10am to walk your team through it?",
};

function judge(turns: readonly string[]): Record<RubricKey, Judgement> {
  const sentences = turns.flatMap(sentencesOf);
  const find = (pattern: RegExp) => sentences.find((sentence) => pattern.test(sentence));
  const questions = sentences.filter((sentence) => sentence.includes("?"));
  const open = questions.filter((sentence) => OPEN_QUESTION.test(sentence));
  const averageWords = turns.length ? wordCount(turns.join(" ")) / turns.length : 0;
  const fillers = turns.join(" ").match(FILLER)?.length ?? 0;
  const youCount = turns.join(" ").match(YOU)?.length ?? 0;
  const benefits = sentences.filter((sentence) => BENEFIT.test(sentence));
  const dated = find(DATED_ASK);
  const ask = dated ?? find(ASK);
  const acknowledged = find(ACKNOWLEDGE);
  const proof = find(PROOF);
  const opener = OPENER.test(turns[0] ?? "");

  const clarityBands = [35, 60, 90, 140];
  const clarity = clamp(5 - clarityBands.filter((limit) => averageWords > limit).length);
  const structurePoints = [turns.length >= 3, questions.length > 0, ask !== undefined, opener];

  return {
    clarity: {
      score: averageWords === 0 ? 1 : clarity,
      justification: `Turns averaged ${String(Math.round(averageWords))} words; shorter turns keep one clear message.`,
      evidence: quote(sentences[0]),
    },
    value: {
      score: clamp(
        1 + Math.min(2, benefits.length) + Number(youCount >= 2) + Number(youCount >= 5),
      ),
      justification: `${String(benefits.length)} sentence(s) named a benefit; the buyer was addressed directly ${String(youCount)} time(s).`,
      evidence: quote(benefits[0]),
    },
    structure: {
      score: clamp(1 + structurePoints.filter(Boolean).length),
      justification: "Checked for an opening, questions, enough back-and-forth, and a closing ask.",
      evidence: quote(sentences[0]),
    },
    discovery: {
      score: clamp(1 + questions.length),
      justification: `${String(questions.length)} question(s) asked, ${String(open.length)} of them open-ended.`,
      evidence: quote(open[0] ?? questions[0]),
    },
    objections: {
      score: clamp(1 + (acknowledged ? 2 : 0) + (proof ? 1 : 0)),
      justification: acknowledged
        ? "Pushback was acknowledged before responding."
        : "Pushback was not acknowledged before responding.",
      evidence: quote(acknowledged),
    },
    confidence: {
      score: clamp(5 - fillers),
      justification: `${String(fillers)} filler or hedging word(s) used.`,
      evidence: quote(find(new RegExp(FILLER.source, "i")) ?? sentences[0]),
    },
    cta: {
      score: dated ? 5 : ask ? 3 : 1,
      justification: dated
        ? "Asked for a specific, time-bound next step."
        : ask
          ? "Asked for a next step but without a time."
          : "No next step was requested.",
      evidence: quote(ask),
    },
  };
}

/** A rubric-shaped scorecard from simple text heuristics; quotes come only from `turns`. */
export function heuristicScorecard(turns: readonly string[], weighted: RubricKey): Scorecard {
  const judged = judge(turns);
  const dimensions = RUBRIC_DIMENSIONS.map(({ key }) => ({ key, ...judged[key] }));
  const ranked = [...RUBRIC_DIMENSIONS].sort((a, b) => judged[b.key].score - judged[a.key].score);
  const weakest = ranked.slice(-3).reverse();
  const longest = turns
    .flatMap(sentencesOf)
    .reduce<string | undefined>(
      (best, s) => (s.length > (best?.length ?? 0) ? s : best),
      undefined,
    );

  return {
    overall: computeOverall(dimensions, weighted),
    dimensions,
    strengths: ranked.slice(0, 3).map((d) => `${d.name}: ${d.high}.`),
    improvements: weakest.map((d) => `${d.name}: aim for ${d.high.toLowerCase()}.`),
    strongerLine: {
      original: (longest ?? "No student turns.").slice(0, LIMITS.transcriptEntryMaxLength),
      improved: IMPROVED_LINES[weakest[0]?.key ?? "cta"],
    },
  };
}
