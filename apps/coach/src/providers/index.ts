import type { CoachConfig } from "../config.js";
import { AnthropicProvider } from "./anthropic.js";
import { FakeProvider } from "./fake.js";
import { OpenAiProvider } from "./openai.js";
import type { LlmProvider } from "./provider.js";

export { FakeProvider } from "./fake.js";
export {
  type ChatMessage,
  createUsageMeter,
  type LlmProvider,
  ProviderError,
  stageTag,
  TASK_TAGS,
  taskOf,
  type UsageMeter,
} from "./provider.js";

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
