import { NotEnoughTurnsError, scoreTranscript, type PracticeDeps } from "@pitchperfect/partner";
import { CoachScoreRequestSchema, type CoachScoreResponse } from "@pitchperfect/shared";
import type { FastifyInstance } from "fastify";
import { CoachError } from "../errors.js";
import { clientSignal, parseBody } from "./support.js";

/**
 * `POST /v1/score`: the engine grades the transcript (dropping any quote the student did not say
 * and computing `overall` itself). A transcript without a student turn is `400 not_enough_turns`.
 */
export function scoreRoute(app: FastifyInstance, deps: PracticeDeps): void {
  app.post("/v1/score", async (request, reply): Promise<CoachScoreResponse> => {
    const req = parseBody(CoachScoreRequestSchema, request.body);
    try {
      return await scoreTranscript(deps, req, clientSignal(reply));
    } catch (error) {
      if (error instanceof NotEnoughTurnsError) {
        throw new CoachError(400, "not_enough_turns", error.message);
      }
      throw error;
    }
  });
}
