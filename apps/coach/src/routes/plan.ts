import { planScenario, type PracticeDeps } from "@pitchperfect/partner";
import { CoachPlanRequestSchema, type CoachPlanResponse } from "@pitchperfect/shared";
import type { FastifyInstance } from "fastify";
import { clientSignal, metered, parseBody } from "./support.js";

/**
 * `POST /v1/plan`: a persona and hidden objections for one practice session. A planned scenario
 * that fails the engine's scenario check is replaced by the safe one, and logged. A failure
 * reports what the plan had used.
 */
export function planRoute(app: FastifyInstance, deps: PracticeDeps): void {
  app.post("/v1/plan", async (request, reply): Promise<CoachPlanResponse> => {
    const req = parseBody(CoachPlanRequestSchema, request.body);
    return metered(deps, "plan", (meter) =>
      planScenario(deps, req, clientSignal(reply), {
        meter,
        onFallback: () => {
          request.log.warn({ outcome: "scenario_flagged" }, "using the safe scenario");
        },
      }),
    );
  });
}
