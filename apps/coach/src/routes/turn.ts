import {
  CoachTurnRequestSchema,
  LIMITS,
  STAGES,
  type CoachTurnRequest,
  type Stage,
} from "@pitchperfect/shared";
import type { FastifyInstance } from "fastify";
import { validationFailed } from "../errors.js";
import { ruleCheck } from "../guardrails/guard-rules.js";
import { InputError, sanitizeInput } from "../guardrails/input.js";
import { checkOutput, type OutputCheck } from "../guardrails/output.js";
import { withTimeout } from "../guardrails/circuit-breaker.js";
import { FALLBACK_LINE, redirectLine } from "../prompts/fixed-lines.js";
import { buildGuardPrompt, GuardSchema, type GuardCategory } from "../prompts/guard.js";
import { buildTurnPrompt, studentTurnNumber } from "../prompts/persona-turn.js";
import { createUsageMeter, ProviderError } from "../providers/index.js";
import type { ChatStreamInput } from "../providers/provider.js";
import { ReplyFilter, splitStageTag } from "./reply-filter.js";
import { openSse, type SseStream } from "./sse.js";
import { clientSignal, parseBody, reliably, usageOf, type PracticeDeps } from "./support.js";

const REPLY_TEMPERATURE = 0.8;

type Outcome = "done" | "fallback" | "redirect" | "error" | "aborted";

interface TurnResult {
  outcome: Outcome;
  stage?: Stage;
}

interface TurnContext {
  deps: PracticeDeps;
  sse: SseStream;
  signal: AbortSignal;
  meter: ReturnType<typeof createUsageMeter>;
}

/** Without a stage tag the coach cannot know the previous stage, so it estimates one from the turn. */
const estimatedStage = (turn: number): Stage =>
  STAGES[Math.min(STAGES.length - 1, Math.floor((turn - 1) / 2))] ?? "opening";

async function classify(text: string, ctx: TurnContext): Promise<GuardCategory> {
  const { deps, signal, meter } = ctx;
  const input = {
    ...buildGuardPrompt(text),
    maxTokens: LIMITS.maxTokensGuard,
    schema: GuardSchema,
    schemaName: "guard",
  };
  const verdict = await reliably(deps, signal, (attemptSignal) =>
    deps.provider.structured(input, attemptSignal, meter),
  );
  return verdict.category;
}

/**
 * Streams one reply. Only reaching the first chunk is retried; after that a failure propagates.
 * `emit` receives the text that is safe to show (no stage tag, no possible canary).
 */
async function streamOnce(
  input: ChatStreamInput,
  ctx: TurnContext,
  emit?: (text: string) => Promise<void>,
): Promise<{ text: string; stage: Stage | undefined }> {
  const { deps, signal, meter } = ctx;
  const { iterator, first } = await reliably(deps, signal, async (attemptSignal) => {
    const iterator = deps.provider.chatStream(input, attemptSignal, meter)[Symbol.asyncIterator]();
    return { iterator, first: await iterator.next() };
  });
  const filter = new ReplyFilter();
  for (let step = first; step.done !== true; step = await iterator.next()) {
    const safe = filter.push(step.value);
    if (emit && safe !== "") await emit(safe);
  }
  return splitStageTag(filter.text);
}

const check = (text: string, ctx: TurnContext): Promise<OutputCheck> =>
  checkOutput(
    text,
    ctx.deps.provider,
    withTimeout(ctx.deps.config.COACH_TIMEOUT_MS, ctx.signal),
    ctx.meter,
  );

/**
 * Streams the persona's reply, then checks the whole text. A canary leak is regenerated once
 * (without streaming); any other failed check, or a second leak, becomes the fallback line.
 */
async function personaReply(turn: CoachTurnRequest, ctx: TurnContext) {
  const input = {
    ...buildTurnPrompt(turn),
    maxTokens: LIMITS.maxTokensReply,
    temperature: REPLY_TEMPERATURE,
  };
  const sendDelta = (text: string) => ctx.sse.send({ type: "delta", text });

  const first = await streamOnce(input, ctx, sendDelta);
  let stage = first.stage;
  let checked = await check(first.text, ctx);
  if (!checked.ok && checked.reason === "canary") {
    const second = await streamOnce(input, ctx);
    stage = second.stage ?? stage;
    checked = await check(second.text, ctx);
    if (checked.ok) await sendDelta(checked.text);
  }
  stage ??= estimatedStage(studentTurnNumber(turn.transcript));
  if (checked.ok) return { outcome: "done" as const, stage, text: checked.text };
  await sendDelta(FALLBACK_LINE);
  return { outcome: "fallback" as const, stage, text: FALLBACK_LINE };
}

async function runTurn(turn: CoachTurnRequest, ctx: TurnContext): Promise<TurnResult> {
  const category = ruleCheck(turn.studentText) ?? (await classify(turn.studentText, ctx));
  if (category !== "ok") {
    const text = redirectLine(category, studentTurnNumber(turn.transcript) - 1);
    await ctx.sse.send({ type: "redirect", text, usage: usageOf(ctx.deps, ctx.meter, "turn") });
    return { outcome: "redirect" };
  }
  const result = await personaReply(turn, ctx);
  await ctx.sse.send({
    type: "done",
    stage: result.stage,
    finalText: result.text,
    usage: usageOf(ctx.deps, ctx.meter, "turn"),
  });
  return { outcome: result.outcome, stage: result.stage };
}

const errorCode = (error: unknown) =>
  error instanceof ProviderError && error.code === "practice_unavailable"
    ? "practice_unavailable"
    : "upstream_error";

/**
 * `POST /v1/turn`: input check → rule and model guard (redirect) → streamed persona reply with the
 * stage tag stripped → output check → `done`. Errors before the stream starts are JSON; after
 * that they are an `error` event.
 */
export function turnRoute(app: FastifyInstance, deps: PracticeDeps): void {
  app.post("/v1/turn", async (request, reply) => {
    const req = parseBody(CoachTurnRequestSchema, request.body);
    let studentText: string;
    try {
      studentText = sanitizeInput(req.studentText);
    } catch (error) {
      if (error instanceof InputError) throw validationFailed();
      throw error;
    }

    const signal = clientSignal(reply);
    void reply.hijack();
    const ctx: TurnContext = { deps, signal, sse: openSse(reply.raw), meter: createUsageMeter() };
    let result: TurnResult = { outcome: "error" };
    try {
      result = await runTurn({ ...req, studentText }, ctx);
    } catch (error) {
      result = { outcome: signal.aborted ? "aborted" : "error" };
      if (error instanceof ProviderError) {
        request.log.warn({ providerError: error.code, status: error.status }, "provider failed");
      } else {
        request.log.error({ err: error }, "turn failed");
      }
      if (!signal.aborted) await ctx.sse.send({ type: "error", code: errorCode(error) });
    } finally {
      ctx.sse.close();
      // The generic "request completed" line covers status and timing; this adds the turn's result.
      const { inputTokens, outputTokens } = ctx.meter.total();
      const { outcome, stage } = result;
      request.log.info(
        { route: "/v1/turn", outcome, stage, inputTokens, outputTokens },
        "turn finished",
      );
    }
  });
}
