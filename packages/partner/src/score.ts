import {
  computeOverall,
  getSkill,
  LIMITS,
  ScorecardSchema,
  type CoachScoreRequest,
  type CoachScoreResponse,
  type TranscriptEntry,
} from "@pitchperfect/shared";
import { structuredWithRepair, usageOf, type Meter, type PracticeDeps } from "./deps.js";
import { ruleCheck } from "./guardrails/guard-rules.js";
import { usableEntries } from "./prompts/blocks.js";
import { buildScorePrompt } from "./prompts/scorer.js";
import { createUsageMeter } from "./provider.js";
import { studentSentences, verifyQuotes } from "./scoring/verify-quotes.js";

/** The transcript has no student turn to grade. Hosts answer it as a 400 or an abandoned session. */
export class NotEnoughTurnsError extends Error {
  constructor() {
    super("There are no student turns to score");
    this.name = "NotEnoughTurnsError";
  }
}

/**
 * The transcript with every student line the guard rules hold back marked flagged, so it is
 * never scored. Lines are flagged when they are said; this also covers a transcript stored
 * before a rule existed, such as a note to the grader.
 */
const withSuspectsFlagged = (transcript: readonly TranscriptEntry[]): TranscriptEntry[] =>
  transcript.map((entry) =>
    entry.role === "student" && entry.flagged !== true && ruleCheck(entry.text) !== null
      ? { ...entry, flagged: true }
      : entry,
  );

/**
 * Grades one finished call: the model scores the transcript, then any quote the student did not
 * say is dropped and `overall` is computed from the dimension scores. Flagged and suspect student
 * lines are left out of what is graded. Usage goes to `meter` as well, so a host can charge what a
 * failed score used.
 */
export async function scoreTranscript(
  deps: PracticeDeps,
  request: CoachScoreRequest,
  signal: AbortSignal,
  meter: Meter = createUsageMeter(),
): Promise<CoachScoreResponse> {
  const req = { ...request, transcript: withSuspectsFlagged(request.transcript) };
  const studentTurns = usableEntries(req.transcript)
    .filter((entry) => entry.role === "student")
    .map((entry) => entry.text);
  if (studentSentences(studentTurns).length === 0) throw new NotEnoughTurnsError();

  const graded = await structuredWithRepair(
    deps,
    {
      ...buildScorePrompt(req),
      maxTokens: LIMITS.maxTokensScore,
      schema: ScorecardSchema,
      schemaName: "scorecard",
    },
    signal,
    meter,
  );
  const verified = verifyQuotes(graded, studentTurns);
  const overall = computeOverall(verified.dimensions, getSkill(req.skill).weighted);
  return { scorecard: { ...verified, overall }, usage: usageOf(deps, meter, "score") };
}
