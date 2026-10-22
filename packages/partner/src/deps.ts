import type { Usage } from "@pitchperfect/shared";
import type { ZodType } from "zod";
import { containsCanary } from "./guardrails/canary.js";
import { CircuitBreaker, withRetry, withTimeout } from "./guardrails/circuit-breaker.js";
import type { PromptInput } from "./prompts/blocks.js";
import { createUsageMeter, ProviderError, type LlmProvider, type UsageMeter } from "./provider.js";

type Meter = ReturnType<typeof createUsageMeter>;

/** What the engine reads from the host's configuration (the coach's env, or fixed demo values). */
export interface PartnerConfig {
  /** Longest a single provider call may take. */
  COACH_TIMEOUT_MS: number;
  COACH_MODEL?: string | undefined;
  COACH_SCORING_MODEL?: string | undefined;
}

/** What the practice steps share: one provider and one circuit breaker per host. */
export interface PracticeDeps {
  provider: LlmProvider;
  config: PartnerConfig;
  breaker: CircuitBreaker;
}

/** 5 retryable failures within 60 s open the breaker for 30 s (docs/practice-partner.md). */
export function createPracticeDeps(config: PartnerConfig, provider: LlmProvider): PracticeDeps {
  const breaker = new CircuitBreaker({ failures: 5, windowMs: 60_000, openMs: 30_000 });
  return { provider, config, breaker };
}

/**
 * One provider call behind the breaker, with one jittered retry on retryable errors and a fresh
 * timeout per attempt. The attempt's signal also aborts when the caller's does.
 */
export function reliably<T>(
  deps: PracticeDeps,
  signal: AbortSignal,
  call: (attemptSignal: AbortSignal) => Promise<T>,
): Promise<T> {
  return deps.breaker.exec(() =>
    withRetry(() => call(withTimeout(deps.config.COACH_TIMEOUT_MS, signal)), {
      retries: 1,
      signal,
    }),
  );
}

/** Usage for a response: the configured model (scoring model for scores), or "fake". */
export function usageOf(deps: PracticeDeps, meter: Meter, task: "plan" | "turn" | "score"): Usage {
  const { COACH_MODEL, COACH_SCORING_MODEL } = deps.config;
  const configured = task === "score" ? COACH_SCORING_MODEL : COACH_MODEL;
  const model = deps.provider.name === "fake" ? "fake" : (configured ?? "unknown");
  return { provider: deps.provider.name, model, ...meter.total() };
}

const REPAIR_DETAIL_MAX_CHARS = 1000;

interface StructuredRequest<T> extends PromptInput {
  maxTokens: number;
  schema: ZodType<T>;
  schemaName: string;
}

/**
 * A structured call that gets one repair attempt: when the output fails validation (or leaks the
 * canary), it is asked again once with the validation summary appended as a user message. A
 * second failure propagates.
 */
export async function structuredWithRepair<T>(
  deps: PracticeDeps,
  request: StructuredRequest<T>,
  signal: AbortSignal,
  meter: UsageMeter,
): Promise<T> {
  const attempt = async (messages: PromptInput["messages"]) => {
    const result = await reliably(deps, signal, (attemptSignal) =>
      deps.provider.structured({ ...request, messages }, attemptSignal, meter),
    );
    if (containsCanary(JSON.stringify(result))) {
      throw new ProviderError("invalid_structured_output", {
        detail: "The output contained a forbidden token.",
      });
    }
    return result;
  };

  try {
    return await attempt(request.messages);
  } catch (error) {
    if (!(error instanceof ProviderError) || error.code !== "invalid_structured_output") {
      throw error;
    }
    const detail = (error.detail ?? "The output was not valid.").slice(0, REPAIR_DETAIL_MAX_CHARS);
    return attempt([
      ...request.messages,
      {
        role: "user",
        content: `Your previous output did not match the required schema:\n${detail}\nReturn the corrected JSON only.`,
      },
    ]);
  }
}
