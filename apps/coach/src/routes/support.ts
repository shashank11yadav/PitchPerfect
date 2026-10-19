import type { Usage } from "@pitchperfect/shared";
import type { FastifyReply } from "fastify";
import type { ZodType } from "zod";
import type { CoachConfig } from "../config.js";
import { validationFailed } from "../errors.js";
import { containsCanary } from "../guardrails/canary.js";
import { CircuitBreaker, withRetry, withTimeout } from "../guardrails/circuit-breaker.js";
import type { PromptInput } from "../prompts/blocks.js";
import {
  createUsageMeter,
  ProviderError,
  type LlmProvider,
  type UsageMeter,
} from "../providers/index.js";

type Meter = ReturnType<typeof createUsageMeter>;

/** What the practice routes share: one provider and one circuit breaker per app. */
export interface PracticeDeps {
  provider: LlmProvider;
  config: Pick<CoachConfig, "COACH_TIMEOUT_MS" | "COACH_MODEL" | "COACH_SCORING_MODEL">;
  breaker: CircuitBreaker;
}

/** 5 retryable failures within 60 s open the breaker for 30 s (docs/practice-partner.md). */
export function createPracticeDeps(config: PracticeDeps["config"], provider: LlmProvider) {
  const breaker = new CircuitBreaker({ failures: 5, windowMs: 60_000, openMs: 30_000 });
  return { provider, config, breaker } satisfies PracticeDeps;
}

/**
 * One provider call behind the breaker, with one jittered retry on retryable errors and a fresh
 * timeout per attempt. The attempt's signal also aborts when the client goes away.
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

/** Validates a request body with a shared schema; failures never echo the body. */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw validationFailed();
  return result.data;
}

/** Aborts when the client disconnects before the response has finished. */
export function clientSignal(reply: FastifyReply): AbortSignal {
  const controller = new AbortController();
  reply.raw.on("close", () => {
    if (!reply.raw.writableFinished) controller.abort();
  });
  return controller.signal;
}

/** Usage for the response: the configured model (scoring model for scores), or "fake". */
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
 * second failure propagates and becomes `502 upstream_error`.
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
