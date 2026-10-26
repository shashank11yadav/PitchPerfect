import OpenAI from "openai";
import type { Moderator } from "@pitchperfect/partner";
import { sdkProviderError } from "./sdk-provider.js";

/**
 * The OpenAI moderation endpoint. It needs only `OPENAI_API_KEY`, so it also moderates an
 * Anthropic deployment that has one. The endpoint reports no token usage, so nothing is metered.
 */
export class OpenAiModerator implements Moderator {
  readonly name = "openai";
  readonly #client: OpenAI;
  readonly #timeoutMs: number;

  constructor({
    apiKey,
    timeoutMs,
    client,
  }: {
    apiKey: string;
    timeoutMs: number;
    client?: OpenAI;
  }) {
    // A failed check fails closed at once; the coach never retries it.
    this.#client = client ?? new OpenAI({ apiKey, maxRetries: 0 });
    this.#timeoutMs = timeoutMs;
  }

  async moderate(text: string, signal: AbortSignal): Promise<{ flagged: boolean }> {
    try {
      // No model is named: the endpoint's default moderation model is used.
      const response = await this.#client.moderations.create(
        { input: text },
        { signal, timeout: this.#timeoutMs },
      );
      return { flagged: response.results.some((result) => result.flagged) };
    } catch (error) {
      throw sdkProviderError(OpenAI, error, signal);
    }
  }
}
