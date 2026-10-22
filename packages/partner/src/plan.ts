import {
  LIMITS,
  type CoachPlanRequest,
  type CoachPlanResponse,
  type ScenarioPrivate,
  type ScenarioPublic,
} from "@pitchperfect/shared";
import { structuredWithRepair, usageOf, type PracticeDeps } from "./deps.js";
import { ruleCheck } from "./guardrails/guard-rules.js";
import { buildPlanPrompt, PlanSchema } from "./prompts/persona-plan.js";
import { createUsageMeter, ProviderError, type UsageMeter } from "./provider.js";

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
 * A persona and hidden objections for one practice session. Employer job text can steer the
 * planner, so a scenario with a flagged field is planned once more without the job (`onReplan`
 * is told); if that is flagged too the plan fails with `upstream_error`.
 */
export async function planScenario(
  deps: PracticeDeps,
  req: CoachPlanRequest,
  signal: AbortSignal,
  onReplan?: () => void,
): Promise<CoachPlanResponse> {
  const meter = createUsageMeter();
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
    onReplan?.();
    scenario = await plan({ ...req, job: undefined }, meter);
    if (looksInjected(scenario)) throw new ProviderError("upstream_error");
  }
  return { ...scenario, usage: usageOf(deps, meter, "plan") };
}
