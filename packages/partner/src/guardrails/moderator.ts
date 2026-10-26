import { LIMITS } from "@pitchperfect/shared";
import { buildModerationPrompt, ModerationSchema } from "../prompts/moderation.js";
import type { LlmProvider, Moderator } from "../provider.js";

/**
 * Moderation through the configured chat model: one short classifier call with structured output.
 * It works with any provider, so a deployment without a moderation endpoint is still covered. An
 * unreadable verdict rejects like any other failure, so the caller fails closed.
 */
export function createModelModerator(provider: LlmProvider): Moderator {
  return {
    name: "model",
    async moderate(text, signal, meter) {
      const input = {
        ...buildModerationPrompt(text),
        maxTokens: LIMITS.maxTokensModeration,
        schema: ModerationSchema,
        schemaName: "moderation",
      };
      const { flagged } = await provider.structured(input, signal, meter);
      return { flagged };
    },
  };
}
