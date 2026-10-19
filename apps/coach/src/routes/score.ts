import {
  CoachScoreRequestSchema,
  computeOverall,
  getSkill,
  LIMITS,
  ScorecardSchema,
  type CoachScoreResponse,
} from "@pitchperfect/shared";
import type { FastifyInstance } from "fastify";
import { CoachError } from "../errors.js";
import { usableEntries } from "../prompts/blocks.js";
import { buildScorePrompt } from "../prompts/scorer.js";
import { createUsageMeter } from "../providers/index.js";
import { studentSentences, verifyQuotes } from "../scoring/verify-quotes.js";
import {
  clientSignal,
  parseBody,
  structuredWithRepair,
  usageOf,
  type PracticeDeps,
} from "./support.js";

/**
 * `POST /v1/score`: the model grades the transcript, then the coach drops any quote the student
 * did not say and computes `overall` itself from the dimension scores.
 */
export function scoreRoute(app: FastifyInstance, deps: PracticeDeps): void {
  app.post("/v1/score", async (request, reply): Promise<CoachScoreResponse> => {
    const req = parseBody(CoachScoreRequestSchema, request.body);
    const studentTurns = usableEntries(req.transcript)
      .filter((entry) => entry.role === "student")
      .map((entry) => entry.text);
    if (studentSentences(studentTurns).length === 0) {
      throw new CoachError(400, "not_enough_turns", "There are no student turns to score");
    }

    const meter = createUsageMeter();
    const graded = await structuredWithRepair(
      deps,
      {
        ...buildScorePrompt(req),
        maxTokens: LIMITS.maxTokensScore,
        schema: ScorecardSchema,
        schemaName: "scorecard",
      },
      clientSignal(reply),
      meter,
    );
    const verified = verifyQuotes(graded, studentTurns);
    const overall = computeOverall(verified.dimensions, getSkill(req.skill).weighted);
    return { scorecard: { ...verified, overall }, usage: usageOf(deps, meter, "score") };
  });
}
