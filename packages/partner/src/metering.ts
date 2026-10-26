import {
  ProviderError,
  type ChatMessage,
  type LlmProvider,
  type Usage,
  type UsageMeter,
} from "./provider.js";

/** About four characters per token, the rough rule for English text. */
const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/**
 * What a call the provider never reported on is charged: the whole prompt, and the full output
 * cap, since the model may have written up to the cap before it was cut off. It errs high.
 */
export function estimatedUsage(input: {
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
}): Usage {
  const prompt = input.system + input.messages.map((message) => message.content).join("");
  return { inputTokens: estimateTokens(prompt), outputTokens: input.maxTokens };
}

/**
 * A provider that turned the call away (429, another 4xx, or the open circuit) never ran the model.
 * Every other failure (a timeout, an abort, a 5xx, a broken connection) may have spent tokens.
 */
const refused = (error: unknown) =>
  error instanceof ProviderError &&
  (error.code === "rate_limited" ||
    error.code === "request_rejected" ||
    error.code === "practice_unavailable");

/** Passes usage on to the caller's meter and remembers whether the provider reported any. */
function callMeter(meter: UsageMeter | undefined) {
  let reported = false;
  return {
    add(usage: Usage) {
      reported = true;
      meter?.add(usage);
    },
    /** Charges the estimate when the provider reported nothing for a call that may have run. */
    settle(input: Parameters<typeof estimatedUsage>[0], error?: unknown) {
      if (!reported && !refused(error)) meter?.add(estimatedUsage(input));
    },
  };
}

/**
 * Wraps a provider so every call that may have spent tokens is charged to the caller's meter. The
 * provider's own figures are used when it reports them. The SDKs report a stream's usage only at
 * its end, so a stream that breaks off, is aborted, or is stopped early (a blocked reply), and a
 * call that times out or fails before a retry, is charged `estimatedUsage` instead.
 */
export function meteredProvider(provider: LlmProvider): LlmProvider {
  return {
    name: provider.name,
    async *chatStream(input, signal, meter) {
      const call = callMeter(meter);
      let failure: unknown;
      try {
        yield* provider.chatStream(input, signal, call);
      } catch (error) {
        failure = error;
        throw error;
      } finally {
        // Also runs when the caller stops reading part-way.
        call.settle(input, failure);
      }
    },
    async structured(input, signal, meter) {
      const call = callMeter(meter);
      let failure: unknown;
      try {
        return await provider.structured(input, signal, call);
      } catch (error) {
        failure = error;
        throw error;
      } finally {
        call.settle(input, failure);
      }
    },
  };
}
