import { FakeProvider, type LlmProvider } from "@pitchperfect/partner";
import type { CoachConfig } from "../config.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAiProvider } from "./openai.js";

export {
  createUsageMeter,
  FakeProvider,
  type LlmProvider,
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
