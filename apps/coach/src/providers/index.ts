import {
  createModelModerator,
  FakeProvider,
  type LlmProvider,
  type Moderator,
} from "@pitchperfect/partner";
import type { CoachConfig } from "../config.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAiModerator } from "./openai-moderator.js";
import { OpenAiProvider } from "./openai.js";

export {
  createUsageMeter,
  FakeProvider,
  type LlmProvider,
  type Moderator,
  ProviderError,
  TASK_TAGS,
  taskOf,
  type UsageMeter,
} from "@pitchperfect/partner";

/** The provider named by `COACH_PROVIDER`; throws if its key or models are missing. */
export function createProvider(config: CoachConfig): LlmProvider {
  switch (config.COACH_PROVIDER) {
    case "fake":
      return new FakeProvider();
    case "openai":
      return new OpenAiProvider({ config });
    case "anthropic":
      return new AnthropicProvider({ config });
  }
}

/**
 * The moderator named by `COACH_MODERATOR` (config resolves the default): the OpenAI moderation
 * endpoint, a classifier call through `provider`, or none.
 */
export function createModerator(config: CoachConfig, provider: LlmProvider): Moderator | undefined {
  switch (config.COACH_MODERATOR) {
    case "openai": {
      if (!config.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for COACH_MODERATOR");
      const timeoutMs = config.COACH_MODERATION_TIMEOUT_MS;
      return new OpenAiModerator({ apiKey: config.OPENAI_API_KEY, timeoutMs });
    }
    case "model":
      return createModelModerator(provider);
    case "none":
      return undefined;
  }
}
