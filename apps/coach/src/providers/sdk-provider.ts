import type { CoachConfig } from "../config.js";
import { abortedBy, ProviderError, taskOf } from "@pitchperfect/partner";

type ErrorClass<T = Error> = abstract new (...args: never[]) => T;

/** The error classes both official SDK clients expose as statics under the same names. */
interface SdkErrorClasses {
  APIError: ErrorClass<Error & { status: number | undefined }>;
  APIUserAbortError: ErrorClass;
  APIConnectionError: ErrorClass;
  APIConnectionTimeoutError: ErrorClass;
}

const API_KEYS = { openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY" } as const;
type SdkProviderName = keyof typeof API_KEYS;

/** Settings, usage, model choice, and error mapping shared by the SDK-backed adapters. */
export abstract class SdkProvider {
  protected readonly apiKey: string;
  readonly #model: string;
  readonly #scoringModel: string;
  readonly #timeoutMs: number;
  readonly #errors: SdkErrorClasses;

  protected constructor(config: CoachConfig, provider: SdkProviderName, errors: SdkErrorClasses) {
    const required = (
      name: (typeof API_KEYS)[SdkProviderName] | "COACH_MODEL" | "COACH_SCORING_MODEL",
    ) => {
      const value = config[name];
      if (!value) throw new Error(`${name} is required when COACH_PROVIDER is ${provider}`);
      return value;
    };
    this.apiKey = required(API_KEYS[provider]);
    this.#model = required("COACH_MODEL");
    this.#scoringModel = required("COACH_SCORING_MODEL");
    this.#timeoutMs = config.COACH_TIMEOUT_MS;
    this.#errors = errors;
  }

  /** Scoring uses `COACH_SCORING_MODEL`; plans, turns, and guard checks use `COACH_MODEL`. */
  protected modelFor(system: string): string {
    return taskOf(system) === "score" ? this.#scoringModel : this.#model;
  }

  protected requestOptions(signal: AbortSignal): { signal: AbortSignal; timeout: number } {
    return { signal, timeout: this.#timeoutMs };
  }

  /** 429, 5xx, connection errors, and timeouts become retryable; nothing upstream leaks into the message. */
  protected toProviderError(error: unknown, signal: AbortSignal): ProviderError {
    const sdk = this.#errors;
    if (error instanceof ProviderError) return error;
    if (signal.aborted) return abortedBy(signal, error);
    if (error instanceof sdk.APIUserAbortError)
      return new ProviderError("aborted", { cause: error });
    if (error instanceof sdk.APIConnectionTimeoutError) {
      return new ProviderError("timeout", { cause: error });
    }
    if (error instanceof sdk.APIConnectionError) {
      return new ProviderError("upstream_unavailable", { cause: error });
    }
    if (error instanceof sdk.APIError) {
      const { status } = error;
      // No status: an error event inside an open stream (e.g. overloaded), so worth a retry.
      if (status === undefined || status >= 500) {
        return new ProviderError("upstream_unavailable", { status, cause: error });
      }
      if (status === 429) return new ProviderError("rate_limited", { status, cause: error });
      return new ProviderError("request_rejected", { status, cause: error });
    }
    return new ProviderError("upstream_error", { cause: error });
  }
}
