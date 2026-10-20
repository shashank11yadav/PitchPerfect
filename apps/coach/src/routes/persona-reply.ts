import { LIMITS, STAGES, type CoachTurnRequest, type Stage } from "@pitchperfect/shared";
import { withTimeout } from "../guardrails/circuit-breaker.js";
import { createLeakScanner } from "../guardrails/leak-scan.js";
import { checkOutput } from "../guardrails/output.js";
import { FALLBACK_LINE } from "../prompts/fixed-lines.js";
import { buildTurnPrompt, studentTurnNumber, TURN_LEAK_SOURCE } from "../prompts/persona-turn.js";
import type { createUsageMeter } from "../providers/index.js";
import type { ChatStreamInput } from "../providers/provider.js";
import { ReplyFilter, splitStageTag, type BlockReason } from "./reply-filter.js";
import type { SseStream } from "./sse.js";
import { reliably, type PracticeDeps } from "./support.js";

const REPLY_TEMPERATURE = 0.8;

/** Built once: the leak source holds only fixed rule text. */
const leaks = createLeakScanner(TURN_LEAK_SOURCE);

export interface TurnContext {
  deps: PracticeDeps;
  sse: SseStream;
  signal: AbortSignal;
  meter: ReturnType<typeof createUsageMeter>;
}

type Failure = BlockReason | "moderation" | "empty";

interface Attempt {
  text: string;
  stage: Stage | undefined;
  blocked: BlockReason | undefined;
}

const stageIndex = (stage: Stage) => STAGES.indexOf(stage);

/** Without a stage tag or a current stage, a rough position in the call from the turn number. */
const estimatedStage = (turn: number): Stage =>
  STAGES[Math.min(STAGES.length - 1, Math.floor((turn - 1) / 2))] ?? "opening";

/** The model's stage, never earlier than the stage the api says the call has reached. */
function nextStage(turn: CoachTurnRequest, modelStage: Stage | undefined): Stage {
  const current = turn.currentStage;
  const candidate = modelStage ?? current ?? estimatedStage(studentTurnNumber(turn.transcript));
  return current && stageIndex(current) > stageIndex(candidate) ? current : candidate;
}

/** Stops the upstream stream early; its own cleanup errors do not matter any more. */
async function stop(iterator: AsyncIterator<string>): Promise<void> {
  try {
    await iterator.return?.();
  } catch {
    // The stream is being abandoned.
  }
}

/**
 * Streams one reply. Only reaching the first chunk is retried; a later provider failure counts
 * toward the circuit breaker and propagates. `emit` receives text that is safe to show. On a
 * leak or harmful text the upstream stream is stopped at once.
 */
async function streamOnce(
  input: ChatStreamInput,
  ctx: TurnContext,
  emit?: (text: string) => Promise<void>,
): Promise<Attempt> {
  const { deps, signal, meter } = ctx;
  const { iterator, first } = await reliably(deps, signal, async (attemptSignal) => {
    const iterator = deps.provider.chatStream(input, attemptSignal, meter)[Symbol.asyncIterator]();
    return { iterator, first: await iterator.next() };
  });
  const filter = new ReplyFilter(leaks);
  try {
    for (let step = first; step.done !== true; step = await iterator.next()) {
      const safe = filter.push(step.value);
      if (filter.blocked) break;
      if (emit && safe !== "") await emit(safe);
    }
  } catch (error) {
    deps.breaker.recordFailure(error);
    throw error;
  }
  if (filter.blocked) {
    await stop(iterator);
    return { text: filter.text, stage: undefined, blocked: filter.blocked };
  }
  const rest = filter.finish();
  if (emit && rest !== "") await emit(rest);
  return { ...splitStageTag(filter.text), blocked: filter.blocked };
}

/** The output check; a moderation failure counts toward the breaker and fails closed. */
async function check(attempt: Attempt, ctx: TurnContext) {
  if (attempt.blocked) return { ok: false as const, reason: attempt.blocked };
  try {
    return await checkOutput(
      attempt.text,
      ctx.deps.provider,
      withTimeout(ctx.deps.config.COACH_TIMEOUT_MS, ctx.signal),
      ctx.meter,
    );
  } catch (error) {
    ctx.deps.breaker.recordFailure(error);
    throw error;
  }
}

const isLeak = (reason: Failure) => reason === "canary" || reason === "instructions";

/**
 * Streams the persona's reply, then checks the whole text. A leak (canary or instructions) is
 * regenerated once without streaming; harmful or flagged text, an empty reply, or a second leak
 * becomes the fallback line. The stage never moves backwards from `currentStage`.
 */
export async function personaReply(turn: CoachTurnRequest, ctx: TurnContext) {
  const input = {
    ...buildTurnPrompt(turn),
    maxTokens: LIMITS.maxTokensReply,
    temperature: REPLY_TEMPERATURE,
  };
  const sendDelta = (text: string) => ctx.sse.send({ type: "delta", text });

  const first = await streamOnce(input, ctx, sendDelta);
  let modelStage = first.stage;
  let checked = await check(first, ctx);
  if (!checked.ok && isLeak(checked.reason)) {
    const second = await streamOnce(input, ctx);
    modelStage = second.stage ?? modelStage;
    checked = await check(second, ctx);
    if (checked.ok) await sendDelta(checked.text);
  }
  const stage = nextStage(turn, modelStage);
  if (checked.ok) return { outcome: "done" as const, stage, text: checked.text };
  await sendDelta(FALLBACK_LINE);
  return { outcome: "fallback" as const, stage, text: FALLBACK_LINE };
}
