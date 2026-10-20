import {
  CoachPlanRequestSchema,
  LIMITS,
  type CoachPlanRequest,
  type CoachPlanResponse,
  type ScenarioPrivate,
  type ScenarioPublic,
} from "@pitchperfect/shared";
import type { FastifyInstance } from "fastify";
import { ruleCheck } from "../guardrails/guard-rules.js";
import { buildPlanPrompt, PlanSchema } from "../prompts/persona-plan.js";
import { createUsageMeter, ProviderError, type UsageMeter } from "../providers/index.js";
import {
  clientSignal,
  parseBody,
  structuredWithRepair,
  usageOf,
  type PracticeDeps,
} from "./support.js";

interface Scenario {
  scenarioPublic: ScenarioPublic;
  scenarioPrivate: ScenarioPrivate;
}

/** True when any generated field reads like an attack or harmful text, e.g. echoed from a job post. */
function looksInjected({ scenarioPublic, scenarioPrivate }: Scenario): boolean {
  const fields = [
    ...Object.values(scenarioPublic),
    ...scenarioPrivate.hiddenObjections,
    ...scenarioPrivate.winConditions,
  ];
  return fields.some((field) => ruleCheck(field) !== null);
}

/**
 * `POST /v1/plan`: a persona and hidden objections for one practice session. Employer job text
 * can steer the planner, so a scenario with a flagged field is planned once more without the job;
 * if that is flagged too the request fails with `502 upstream_error`.
 */
export function planRoute(app: FastifyInstance, deps: PracticeDeps): void {
  app.post("/v1/plan", async (request, reply): Promise<CoachPlanResponse> => {
    const req = parseBody(CoachPlanRequestSchema, request.body);
    const meter = createUsageMeter();
    const signal = clientSignal(reply);
    const plan = (input: CoachPlanRequest, usage: UsageMeter) =>
      structuredWithRepair(
        deps,
        {
          ...buildPlanPrompt(input),
          maxTokens: LIMITS.maxTokensPlan,
          schema: PlanSchema,
          schemaName: "scenario",
        },
        signal,
        usage,
      );

    let scenario = await plan(req, meter);
    if (looksInjected(scenario)) {
      request.log.warn({ outcome: "scenario_flagged" }, "re-planning without the job");
      scenario = await plan({ ...req, job: undefined }, meter);
      if (looksInjected(scenario)) throw new ProviderError("upstream_error");
    }
    return { ...scenario, usage: usageOf(deps, meter, "plan") };
  });
}
