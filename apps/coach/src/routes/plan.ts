import { planScenario, type PracticeDeps } from "@pitchperfect/partner";
import { CoachPlanRequestSchema, type CoachPlanResponse } from "@pitchperfect/shared";
import type { FastifyInstance } from "fastify";
import { clientSignal, parseBody } from "./support.js";

/**
 * `POST /v1/plan`: a persona and hidden objections for one practice session. A scenario the
 * engine had to plan again without the job is logged; a second flagged plan is `502 upstream_error`.
 */
export function planRoute(app: FastifyInstance, deps: PracticeDeps): void {
  app.post("/v1/plan", async (request, reply): Promise<CoachPlanResponse> => {
    const req = parseBody(CoachPlanRequestSchema, request.body);
    return planScenario(deps, req, clientSignal(reply), () => {
      request.log.warn({ outcome: "scenario_flagged" }, "re-planning without the job");
    });
  });
}
