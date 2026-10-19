import { z, type ZodType } from "zod";
import type { Stage } from "@pitchperfect/shared";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatStreamInput {
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
}

export interface StructuredInput<T> {
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  schema: ZodType<T>;
  schemaName: string;
}

/** Collects token usage for one caller; providers add once per underlying API call. */
export interface UsageMeter {
  add(usage: Usage): void;
}

export interface LlmProvider {
  readonly name: "openai" | "anthropic" | "fake";
  /** Yields text deltas. */
  chatStream(
    input: ChatStreamInput,
    signal: AbortSignal,
    meter?: UsageMeter,
  ): AsyncIterable<string>;
  structured<T>(input: StructuredInput<T>, signal: AbortSignal, meter?: UsageMeter): Promise<T>;
  moderate?(text: string, signal: AbortSignal, meter?: UsageMeter): Promise<{ flagged: boolean }>;
}

/** A meter that sums every call added to it. */
export function createUsageMeter(): UsageMeter & { total(): Usage } {
  const sum: Usage = { inputTokens: 0, outputTokens: 0 };
  return {
    add(usage) {
      sum.inputTokens += usage.inputTokens;
      sum.outputTokens += usage.outputTokens;
    },
    total: () => ({ ...sum }),
  };
}

/**
 * Every system prompt starts with one of these tags. The fake provider keys its scripted
 * output on it and the real adapters pick the scoring model for `score`.
 */
export const TASK_TAGS = {
  plan: "[task:plan]",
  turn: "[task:turn]",
  score: "[task:score]",
  guard: "[task:guard]",
} as const;
export type ProviderTask = keyof typeof TASK_TAGS;

const TASKS = Object.keys(TASK_TAGS) as ProviderTask[];

export function taskOf(system: string): ProviderTask | undefined {
  const start = system.trimStart();
  return TASKS.find((task) => start.startsWith(TASK_TAGS[task]));
}

/** Persona replies end with this tag naming the stage reached; the turn route strips it. */
export const stageTag = (stage: Stage) => `[[stage:${stage}]]`;

type ProviderErrorCode =
  | "invalid_structured_output"
  | "rate_limited"
  | "upstream_unavailable"
  | "timeout"
  | "aborted"
  | "request_rejected"
  | "upstream_error";

const RETRYABLE: ReadonlySet<ProviderErrorCode> = new Set([
  "rate_limited",
  "upstream_unavailable",
  "timeout",
]);

/**
 * A provider call failed. `retryable` marks 429, 5xx, connection errors, and timeouts.
 * The message never contains model or upstream text; `detail` (validation issues only)
 * is for the one structured-output retry.
 */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;
  readonly status: number | undefined;
  readonly detail: string | undefined;

  constructor(
    code: ProviderErrorCode,
    options: { status?: number; detail?: string; cause?: unknown } = {},
  ) {
    super(`Provider call failed: ${code}`, { cause: options.cause });
    this.name = "ProviderError";
    this.code = code;
    this.retryable = RETRYABLE.has(code);
    this.status = options.status;
    this.detail = options.detail;
  }
}

/** Parses model output (raw JSON text or an already-decoded value) against the caller's schema. */
export function parseStructured<T>(output: unknown, schema: ZodType<T>): T {
  let value = output;
  if (typeof output === "string") {
    try {
      value = JSON.parse(output);
    } catch {
      // The parser's message can quote the model's text, so it is not kept.
      throw new ProviderError("invalid_structured_output", { detail: "Output was not valid JSON" });
    }
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ProviderError("invalid_structured_output", {
      detail: z.prettifyError(result.error),
    });
  }
  return result.data;
}

/** The error for a call cut short by its signal: a timeout (retryable) or a caller abort. */
export function abortedBy(signal: AbortSignal, cause?: unknown): ProviderError {
  const reason: unknown = signal.reason;
  const timedOut = reason instanceof Error && reason.name === "TimeoutError";
  return new ProviderError(timedOut ? "timeout" : "aborted", { cause: cause ?? reason });
}
