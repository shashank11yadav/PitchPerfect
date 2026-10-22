import {
  computeOverall,
  getSkill,
  LIMITS,
  ScorecardSchema,
  type CoachScoreRequest,
  type CoachScoreResponse,
} from "@pitchperfect/shared";
import { structuredWithRepair, usageOf, type PracticeDeps } from "./deps.js";
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
 * Grades one finished call: the model scores the transcript, then any quote the student did not
 * say is dropped and `overall` is computed from the dimension scores.
 */
export async function scoreTranscript(
  deps: PracticeDeps,
  req: CoachScoreRequest,
  signal: AbortSignal,
): Promise<CoachScoreResponse> {
  const studentTurns = usableEntries(req.transcript)
    .filter((entry) => entry.role === "student")
    .map((entry) => entry.text);
  if (studentSentences(studentTurns).length === 0) throw new NotEnoughTurnsError();

  const meter = createUsageMeter();
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
