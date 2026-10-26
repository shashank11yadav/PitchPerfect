import {
  LIMITS,
  STAGES,
  type CoachTurnEvent,
  type CoachTurnRequest,
  type Stage,
} from "@pitchperfect/shared";
import { withTimeout } from "../guardrails/circuit-breaker.js";
import { createLeakScanner, createScenarioLeakScanner } from "../guardrails/leak-scan.js";
import { checkOutput, type FlagCheck } from "../guardrails/output.js";
import { FALLBACK_LINE } from "../prompts/fixed-lines.js";
import { buildTurnPrompt, studentTurnNumber, TURN_LEAK_SOURCE } from "../prompts/persona-turn.js";
import { reliably, type PracticeDeps } from "../deps.js";
import { abortedBy, type ChatStreamInput, type createUsageMeter } from "../provider.js";
import { ReplyFilter, splitStageTag, type BlockReason } from "./reply-filter.js";
import { SentenceGate } from "./sentence-gate.js";

const REPLY_TEMPERATURE = 0.8;

/** Built once: the leak source holds only fixed rule text. */
const leaksRules = createLeakScanner(TURN_LEAK_SOURCE);

/** Where a turn's events go: the coach's SSE response, or the demo room in the browser. */
export interface TurnSink {
  /** Delivers one event; resolves once the receiver can take more. */
  send(event: CoachTurnEvent): Promise<void>;
}

export interface TurnContext {
  deps: PracticeDeps;
  sink: TurnSink;
  signal: AbortSignal;
  meter: ReturnType<typeof createUsageMeter>;
}

type Failure = BlockReason | "moderation" | "empty";

interface Attempt {
  text: string;
  stage: Stage | undefined;
  blocked: BlockReason | "moderation" | undefined;
  /** True when a single sentence check already moderated the whole reply. */
  moderated: boolean;
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

const notFlagged: FlagCheck = () => Promise.resolve(false);

/**
 * The host's moderator for this turn, or undefined without one. It fails closed: an error or a
 * timeout counts as flagged (and toward the breaker); only the caller's own abort propagates.
 */
function flagCheck(ctx: TurnContext): FlagCheck | undefined {
  const { moderator, config, breaker } = ctx.deps;
  if (!moderator) return undefined;
  const timeoutMs = config.COACH_MODERATION_TIMEOUT_MS ?? config.COACH_TIMEOUT_MS;
  return async (text) => {
    try {
      const result = await moderator.moderate(text, withTimeout(timeoutMs, ctx.signal), ctx.meter);
      return result.flagged;
    } catch (error) {
      if (ctx.signal.aborted) throw abortedBy(ctx.signal, error);
      breaker.recordFailure(error);
      return true;
    }
  };
}

/**
 * Streams one reply. Only reaching the first chunk is retried; a later provider failure counts
 * toward the circuit breaker and propagates. With `emit`, the text the reply filter releases goes
 * through the sentence gate, and `emit` receives only sentences that passed moderation. On a
 * leak (`leaks` reads the whole text so far), a reply rule or a flagged sentence the upstream
 * stream is stopped at once.
 */
async function streamOnce(
  input: ChatStreamInput,
  leaks: (text: string) => boolean,
  ctx: TurnContext,
  flagged: FlagCheck | undefined,
  emit?: (text: string) => Promise<void>,
): Promise<Attempt> {
  const { deps, signal, meter } = ctx;
  const { iterator, first } = await reliably(deps, signal, async (attemptSignal) => {
    const iterator = deps.provider.chatStream(input, attemptSignal, meter)[Symbol.asyncIterator]();
    return { iterator, first: await iterator.next() };
  });
  const filter = new ReplyFilter(leaks);
  const gate = emit && new SentenceGate(flagged ?? notFlagged, emit);
  const blocked = (reason: BlockReason | "moderation"): Attempt => ({
    text: filter.text,
    stage: undefined,
    blocked: reason,
    moderated: false,
  });
  try {
    for (let step = first; step.done !== true; step = await iterator.next()) {
      const safe = filter.push(step.value);
      if (filter.blocked || gate?.blocked) break;
      gate?.push(safe);
    }
  } catch (error) {
    await gate?.stop();
    deps.breaker.recordFailure(error);
    throw error;
  }
  const early = filter.blocked ?? (gate?.blocked ? "moderation" : undefined);
  if (early) {
    await gate?.stop();
    await stop(iterator);
    return blocked(early);
  }
  const rest = filter.finish();
  // The end of the stream can complete a rule match, such as a request with no closing "?".
  const late = filter.blocked;
  if (late) {
    await gate?.stop();
    return blocked(late);
  }
  if (gate) {
    gate.push(rest);
    if (!(await gate.finish())) return blocked("moderation");
  }
  return { ...splitStageTag(filter.text), blocked: undefined, moderated: gate?.sentences === 1 };
}

/** The whole-reply check, moderated again unless one sentence check already covered it. */
function check(attempt: Attempt, flagged: FlagCheck | undefined) {
  if (attempt.blocked) return Promise.resolve({ ok: false as const, reason: attempt.blocked });
  return checkOutput(attempt.text, attempt.moderated ? undefined : flagged);
}

const isLeak = (reason: Failure) => reason === "canary" || reason === "instructions";

/**
 * Streams the persona's reply one checked sentence at a time, then checks the whole text. A leak
 * (the canary, the rule text, or the hidden part of this turn's scenario) is regenerated once
 * without streaming; a rule hit, flagged text, an empty reply, or a second leak becomes the
 * fallback line. When the final text replaces anything already shown, such as a leak caught only
 * once a later sentence completed it, a `retract` carries it so the student never keeps withdrawn
 * text. The stage never moves backwards from `currentStage`.
 */
export async function personaReply(turn: CoachTurnRequest, ctx: TurnContext) {
  const input = {
    ...buildTurnPrompt(turn),
    maxTokens: LIMITS.maxTokensReply,
    temperature: REPLY_TEMPERATURE,
  };
  const leaksScenario = createScenarioLeakScanner(turn.scenarioPrivate);
  const leaks = (text: string) => leaksRules(text) || leaksScenario(text);
  const flagged = flagCheck(ctx);
  let shown = false;
  const sendDelta = async (text: string) => {
    shown = true;
    await ctx.sink.send({ type: "delta", text });
  };
  const replaceWith = (text: string) =>
    ctx.sink.send(shown ? { type: "retract", text } : { type: "delta", text });

  const first = await streamOnce(input, leaks, ctx, flagged, sendDelta);
  let modelStage = first.stage;
  let checked = await check(first, flagged);
  if (!checked.ok && isLeak(checked.reason)) {
    const second = await streamOnce(input, leaks, ctx, flagged);
    modelStage = second.stage ?? modelStage;
    checked = await check(second, flagged);
    if (checked.ok) await replaceWith(checked.text);
  }
  const stage = nextStage(turn, modelStage);
  if (checked.ok) return { outcome: "done" as const, stage, text: checked.text };
  await replaceWith(FALLBACK_LINE);
  return { outcome: "fallback" as const, stage, text: FALLBACK_LINE };
}
