import { LIMITS, type CoachPlanRequest, type CoachPlanResponse } from "@pitchperfect/shared";
import { structuredWithRepair, usageOf, type PracticeDeps } from "./deps.js";
import { failsScenarioCheck } from "./guardrails/scenario-check.js";
import { buildPlanPrompt, PlanSchema } from "./prompts/persona-plan.js";
import { createUsageMeter } from "./provider.js";
import { safeScenario, type Scenario } from "./safe-scenario.js";

/** True when any generated field fails the scenario check, e.g. because a job post steered it. */
function failsCheck({ scenarioPublic, scenarioPrivate }: Scenario): boolean {
  const fields = [
    ...Object.values(scenarioPublic),
    ...scenarioPrivate.hiddenObjections,
    ...scenarioPrivate.winConditions,
  ];
  return fields.some(failsScenarioCheck);
}

/**
 * A persona and hidden objections for one practice session. Employer job text can steer the
 * planner, so the planned scenario is checked before it is used; one that fails is replaced by a
 * fixed safe scenario for the skill and the job's title (`onFallback` is told).
 */
export async function planScenario(
  deps: PracticeDeps,
  req: CoachPlanRequest,
  signal: AbortSignal,
  onFallback?: () => void,
): Promise<CoachPlanResponse> {
  const meter = createUsageMeter();
  let scenario: Scenario = await structuredWithRepair(
    deps,
    {
      ...buildPlanPrompt(req),
      maxTokens: LIMITS.maxTokensPlan,
      schema: PlanSchema,
      schemaName: "scenario",
    },
    signal,
    meter,
  );
  if (failsCheck(scenario)) {
    onFallback?.();
    scenario = safeScenario(req);
  }
  return { ...scenario, usage: usageOf(deps, meter, "plan") };
}
