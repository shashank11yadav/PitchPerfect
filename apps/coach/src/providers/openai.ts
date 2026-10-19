import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { CompletionUsage } from "openai/resources/completions";
import type { CoachConfig } from "../config.js";
import { toStrictJsonSchema } from "./json-schema.js";
import {
  type ChatStreamInput,
  type LlmProvider,
  parseStructured,
  ProviderError,
  type StructuredInput,
  ZERO_USAGE,
} from "./provider.js";
import { SdkProvider } from "./sdk-provider.js";

const toUsage = (usage: CompletionUsage) => ({
  inputTokens: usage.prompt_tokens,
  outputTokens: usage.completion_tokens,
});

/** Chat Completions with streaming, strict JSON-schema structured output, and moderation. */
export class OpenAiProvider extends SdkProvider implements LlmProvider {
  readonly name = "openai";
  readonly #client: OpenAI;

  constructor({ config, client }: { config: CoachConfig; client?: OpenAI }) {
    super(config, "openai", OpenAI);
    // Retries and backoff are the coach's own policy, so the SDK never retries on its own.
    this.#client = client ?? new OpenAI({ apiKey: this.apiKey, maxRetries: 0 });
  }

  #messages({ system, messages }: Pick<ChatStreamInput, "system" | "messages">) {
    // `developer` is the current name for the system role on Chat Completions.
    const developer = { role: "developer" as const, content: system };
    return [developer, ...messages] satisfies ChatCompletionMessageParam[];
  }

  async *chatStream(input: ChatStreamInput, signal: AbortSignal): AsyncIterable<string> {
    this.recordUsage(ZERO_USAGE);
    try {
      const stream = await this.#client.chat.completions.create(
        {
          model: this.modelFor(input.system),
          stream: true,
          stream_options: { include_usage: true },
          max_completion_tokens: input.maxTokens,
          temperature: input.temperature,
          messages: this.#messages(input),
        },
        this.requestOptions(signal),
      );
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta.content;
        if (delta) yield delta;
        if (chunk.usage) this.recordUsage(toUsage(chunk.usage));
      }
    } catch (error) {
      throw this.toProviderError(error, signal);
    }
  }

  async structured<T>(input: StructuredInput<T>, signal: AbortSignal): Promise<T> {
    this.recordUsage(ZERO_USAGE);
    const { schema, strict } = toStrictJsonSchema(input.schema);
    let content: string | null | undefined;
    try {
      const completion = await this.#client.chat.completions.create(
        {
          model: this.modelFor(input.system),
          max_completion_tokens: input.maxTokens,
          messages: this.#messages(input),
          response_format: {
            type: "json_schema",
            json_schema: { name: input.schemaName, schema, strict },
          },
        },
        this.requestOptions(signal),
      );
      if (completion.usage) this.recordUsage(toUsage(completion.usage));
      content = completion.choices[0]?.message.content;
    } catch (error) {
      throw this.toProviderError(error, signal);
    }
    // A refusal or an empty completion leaves nothing to validate.
    if (!content) {
      throw new ProviderError("invalid_structured_output", { detail: "No structured output" });
    }
    return parseStructured(content, input.schema);
  }

  async moderate(text: string, signal: AbortSignal): Promise<{ flagged: boolean }> {
    try {
      // No model is named: the endpoint's default moderation model is used.
      const response = await this.#client.moderations.create(
        { input: text },
        this.requestOptions(signal),
      );
      return { flagged: response.results.some((result) => result.flagged) };
    } catch (error) {
      throw this.toProviderError(error, signal);
    }
  }
}
