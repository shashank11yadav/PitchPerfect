import { CoachPlanRequestSchema, LIMITS, type CoachPlanResponse } from "@pitchperfect/shared";
import type { FastifyInstance } from "fastify";
import { buildPlanPrompt, PlanSchema } from "../prompts/persona-plan.js";
import { createUsageMeter } from "../providers/index.js";
import {
  clientSignal,
  parseBody,
  structuredWithRepair,
  usageOf,
  type PracticeDeps,
} from "./support.js";

/** `POST /v1/plan`: a persona and hidden objections for one practice session. */
export function planRoute(app: FastifyInstance, deps: PracticeDeps): void {
  app.post("/v1/plan", async (request, reply): Promise<CoachPlanResponse> => {
    const req = parseBody(CoachPlanRequestSchema, request.body);
    const meter = createUsageMeter();
    const plan = await structuredWithRepair(
      deps,
      {
        ...buildPlanPrompt(req),
        maxTokens: LIMITS.maxTokensPlan,
        schema: PlanSchema,
        schemaName: "scenario",
      },
      clientSignal(reply),
      meter,
    );
    return { ...plan, usage: usageOf(deps, meter, "plan") };
  });
}
