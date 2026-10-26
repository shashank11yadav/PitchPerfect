import Anthropic from "@anthropic-ai/sdk";
import type { Usage as MessageUsage } from "@anthropic-ai/sdk/resources/messages";
import type { CoachConfig } from "../config.js";
import { toJsonSchema } from "./json-schema.js";
import {
  type ChatStreamInput,
  type LlmProvider,
  parseStructured,
  ProviderError,
  type StructuredInput,
  abortedBy,
  type UsageMeter,
} from "@pitchperfect/partner";
import { SdkProvider } from "./sdk-provider.js";

const toUsage = (usage: MessageUsage) => ({
  inputTokens:
    usage.input_tokens +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0),
  outputTokens: usage.output_tokens,
});

/**
 * Messages API with streaming; structured output through one forced tool whose input schema
 * is the JSON schema. Temperature is not sent: the SDK marks it deprecated and current models
 * reject non-default values. There is no moderation endpoint: without an OpenAI key, replies
 * are moderated by a classifier call through this provider (see `createModerator`).
 */
export class AnthropicProvider extends SdkProvider implements LlmProvider {
  readonly name = "anthropic";
  readonly #client: Anthropic;

  constructor({ config, client }: { config: CoachConfig; client?: Anthropic }) {
    super(config, "anthropic", Anthropic);
    // Retries and backoff are the coach's own policy, so the SDK never retries on its own.
    this.#client = client ?? new Anthropic({ apiKey: this.apiKey, maxRetries: 0 });
  }

  #request({ system, messages, maxTokens }: Omit<ChatStreamInput, "temperature">) {
    return { model: this.modelFor(system), max_tokens: maxTokens, system, messages };
  }

  async *chatStream(
    input: ChatStreamInput,
    signal: AbortSignal,
    meter?: UsageMeter,
  ): AsyncIterable<string> {
    try {
      const stream = this.#client.messages.stream(
        this.#request(input),
        this.requestOptions(signal),
      );
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield event.delta.text;
        }
      }
      // An abort can end the event stream quietly; never treat that as a finished reply.
      if (signal.aborted) throw abortedBy(signal);
      meter?.add(toUsage((await stream.finalMessage()).usage));
    } catch (error) {
      throw this.toProviderError(error, signal);
    }
  }

  async structured<T>(
    input: StructuredInput<T>,
    signal: AbortSignal,
    meter?: UsageMeter,
  ): Promise<T> {
    const name = input.schemaName;
    // Conversion errors are programming errors, raised before any call (as in the OpenAI adapter).
    const inputSchema = { type: "object" as const, ...toJsonSchema(input.schema) };
    let toolInput: unknown;
    try {
      const message = await this.#client.messages.create(
        {
          ...this.#request(input),
          tools: [{ name, input_schema: inputSchema }],
          tool_choice: { type: "tool", name },
        },
        this.requestOptions(signal),
      );
      meter?.add(toUsage(message.usage));
      const block = message.content.find((item) => item.type === "tool_use" && item.name === name);
      toolInput = block?.type === "tool_use" ? block.input : undefined;
    } catch (error) {
      throw this.toProviderError(error, signal);
    }
    if (toolInput === undefined) {
      throw new ProviderError("invalid_structured_output", { detail: "No structured output" });
    }
    return parseStructured(toolInput, input.schema);
  }
}
