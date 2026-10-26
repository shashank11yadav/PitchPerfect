import {
  LIMITS,
  STAGES,
  type CoachTurnEvent,
  type CoachTurnRequest,
  type Stage,
} from "@pitchperfect/shared";
import { withTimeout } from "../guardrails/circuit-breaker.js";
import {
  createLeakScanner,
  createScenarioLeakScanner,
  createSessionLeakScanner,
} from "../guardrails/leak-scan.js";
import { checkOutput, type FlagCheck, type OutputCheck } from "../guardrails/output.js";
import { FALLBACK_LINE } from "../prompts/fixed-lines.js";
import { buildTurnPrompt, studentTurnNumber, TURN_LEAK_SOURCE } from "../prompts/persona-turn.js";
import { reliably, type PracticeDeps } from "../deps.js";
import {
  abortedBy,
  ProviderError,
  type ChatStreamInput,
  type createUsageMeter,
} from "../provider.js";
import { ReplyFilter, type BlockReason } from "./reply-filter.js";
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
  /** The reply as it is shown, spoken and stored: the sentence gate's text. */
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

const rateLimited = (error: unknown) =>
  error instanceof ProviderError && error.code === "rate_limited";

/**
 * The host's moderator for this turn, or undefined without one. It fails closed: an error or a
 * timeout counts as flagged, so the reply becomes the fallback line; only the caller's own abort
 * propagates. A rate limit stays with this turn. Any other retryable failure counts toward the
 * shared breaker once per turn, however many of the turn's checks failed with it.
 */
function flagCheck(ctx: TurnContext): FlagCheck | undefined {
  const { moderator, config, breaker } = ctx.deps;
  if (!moderator) return undefined;
  const timeoutMs = config.COACH_MODERATION_TIMEOUT_MS ?? config.COACH_TIMEOUT_MS;
  let counted = false;
  return async (text) => {
    try {
      const result = await moderator.moderate(text, withTimeout(timeoutMs, ctx.signal), ctx.meter);
      return result.flagged;
    } catch (error) {
      if (ctx.signal.aborted) throw abortedBy(ctx.signal, error);
      if (!counted && !rateLimited(error)) {
        counted = true;
        breaker.recordFailure(error);
      }
      return true;
    }
  };
}

/**
 * Streams one reply. Only reaching the first chunk is retried; a later provider failure counts
 * toward the circuit breaker and propagates. The text the reply filter releases goes through the
 * sentence gate, which makes it plain text within the word cap; with `emit`, the gate moderates
 * each sentence and `emit` receives only sentences that passed. On a leak (`leaks` reads the whole
 * text so far), a reply rule, a flagged sentence or a full word cap the upstream stream is stopped
 * at once.
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
  const gate = emit
    ? new SentenceGate(flagged ?? notFlagged, emit)
    : new SentenceGate(notFlagged, () => Promise.resolve());
  const blocked = (reason: BlockReason | "moderation"): Attempt => ({
    text: gate.text,
    stage: undefined,
    blocked: reason,
    moderated: false,
  });
  try {
    for (let step = first; step.done !== true; step = await iterator.next()) {
      const safe = filter.push(step.value);
      if (filter.blocked || gate.blocked) break;
      gate.push(safe);
      if (gate.full) break;
    }
  } catch (error) {
    await gate.stop();
    deps.breaker.recordFailure(error);
    throw error;
  }
  const early = filter.blocked ?? (gate.blocked ? "moderation" : undefined);
  if (early) {
    await gate.stop();
    await stop(iterator);
    return blocked(early);
  }
  if (gate.full) await stop(iterator);
  else {
    const rest = filter.finish();
    // The end of the stream can complete a rule match, such as a request with no closing "?".
    const late = filter.blocked;
    if (late) {
      await gate.stop();
      return blocked(late);
    }
    gate.push(rest);
  }
  if (!(await gate.finish())) return blocked("moderation");
  return {
    text: gate.text,
    stage: filter.stage,
    blocked: undefined,
    moderated: emit !== undefined && gate.sentences === 1,
  };
}

/**
 * The whole-reply check, on the text that is shown, spoken and stored: leaks (in this reply and
 * across the session's replies), the canary, the reply rules, and moderation again unless one
 * sentence check already covered it.
 */
async function check(
  attempt: Attempt,
  leaks: (text: string) => boolean,
  flagged: FlagCheck | undefined,
): Promise<OutputCheck | { ok: false; reason: Failure }> {
  if (attempt.blocked) return { ok: false, reason: attempt.blocked };
  if (leaks(attempt.text)) return { ok: false, reason: "instructions" };
  return checkOutput(attempt.text, attempt.moderated ? undefined : flagged);
}

const isLeak = (reason: Failure) => reason === "canary" || reason === "instructions";

/**
 * Streams the persona's reply one checked sentence at a time, then checks the whole text. What is
 * streamed, checked and returned (to be spoken and stored) is the same text: hidden markers and
 * invisible characters stripped, plain text within the word cap. A leak (the canary, the rule
 * text, the hidden part of this turn's scenario, or a secret completed across the partner's
 * replies in the transcript) is regenerated once without streaming; a rule hit, flagged text, an
 * empty reply, or a second leak becomes the fallback line. When the final text replaces anything
 * already shown, such as a leak caught only once a later sentence completed it, a `retract` carries
 * it so the student never keeps withdrawn text. The stage never moves backwards from
 * `currentStage`.
 */
export async function personaReply(turn: CoachTurnRequest, ctx: TurnContext) {
  const input = {
    ...buildTurnPrompt(turn),
    maxTokens: LIMITS.maxTokensReply,
    temperature: REPLY_TEMPERATURE,
  };
  const earlier = turn.transcript.flatMap((entry) =>
    entry.role === "partner" ? [entry.text] : [],
  );
  const leaksScenario = createScenarioLeakScanner(turn.scenarioPrivate);
  const leaksSession = createSessionLeakScanner(turn.scenarioPrivate, earlier);
  const leaks = (text: string) => leaksRules(text) || leaksScenario(text) || leaksSession(text);
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
  let checked = await check(first, leaks, flagged);
  if (!checked.ok && isLeak(checked.reason)) {
    const second = await streamOnce(input, leaks, ctx, flagged);
    modelStage = second.stage ?? modelStage;
    checked = await check(second, leaks, flagged);
    if (checked.ok) await replaceWith(checked.text);
  }
  const stage = nextStage(turn, modelStage);
  if (checked.ok) return { outcome: "done" as const, stage, text: checked.text };
  await replaceWith(FALLBACK_LINE);
  return { outcome: "fallback" as const, stage, text: FALLBACK_LINE };
}
