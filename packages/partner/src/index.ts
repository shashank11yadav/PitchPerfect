/**
 * The practice partner engine: prompts, guardrails, the provider interface, and the three steps
 * of a session (plan, turn, score) without any transport. The coach service wraps it in Fastify
 * routes behind an HMAC check; the static demo runs it in the browser. The scripted provider is
 * its own package, `@pitchperfect/scripted-partner`.
 */
export {
  createPracticeDeps,
  reliably,
  structuredWithRepair,
  usageOf,
  type PartnerConfig,
  type PracticeDeps,
} from "./deps.js";
export { CANARY, containsCanary } from "./guardrails/canary.js";
export { CircuitBreaker, withRetry, withTimeout } from "./guardrails/circuit-breaker.js";
export { ruleCheck } from "./guardrails/guard-rules.js";
export { InputError, sanitizeInput } from "./guardrails/input.js";
export { createLeakScanner } from "./guardrails/leak-scan.js";
export { createModelModerator } from "./guardrails/moderator.js";
export { replyRuleCheck, type ReplyRuleVerdict } from "./guardrails/reply-rules.js";
export { planScenario } from "./plan.js";
// The prompt formats a provider reads; the scripted provider parses them.
export { dataBlock, scenarioBlock } from "./prompts/blocks.js";
export { buildPlanPrompt } from "./prompts/persona-plan.js";
export { buildTurnPrompt, TURN_LEAK_SOURCE } from "./prompts/persona-turn.js";
export {
  abortedBy,
  createUsageMeter,
  parseStructured,
  ProviderError,
  stageTag,
  TASK_TAGS,
  taskOf,
  type ChatMessage,
  type ChatStreamInput,
  type LlmProvider,
  type Moderator,
  type ProviderTask,
  type StructuredInput,
  type Usage,
  type UsageMeter,
} from "./provider.js";
export { NotEnoughTurnsError, scoreTranscript } from "./score.js";
export { type TurnContext, type TurnSink } from "./turn/persona-reply.js";
export { runTurn, turnErrorCode, type TurnOutcome, type TurnResult } from "./turn/run-turn.js";
