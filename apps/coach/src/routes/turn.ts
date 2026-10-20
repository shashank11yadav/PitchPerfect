import {
  CoachTurnRequestSchema,
  LIMITS,
  type CoachTurnRequest,
  type Stage,
} from "@pitchperfect/shared";
import type { FastifyInstance } from "fastify";
import { validationFailed } from "../errors.js";
import { ruleCheck } from "../guardrails/guard-rules.js";
import { InputError, sanitizeInput } from "../guardrails/input.js";
import { redirectLine } from "../prompts/fixed-lines.js";
import { buildGuardPrompt, GuardSchema, type GuardCategory } from "../prompts/guard.js";
import { studentTurnNumber } from "../prompts/persona-turn.js";
import { createUsageMeter, ProviderError } from "../providers/index.js";
import { personaReply, type TurnContext } from "./persona-reply.js";
import { openSse } from "./sse.js";
import { clientSignal, parseBody, reliably, usageOf, type PracticeDeps } from "./support.js";

type Outcome = "done" | "fallback" | "redirect" | "error" | "aborted";

interface TurnResult {
  outcome: Outcome;
  stage?: Stage;
}

/**
 * The model guard. An unparseable verdict gets one cheap retry; any other failure, or a second
 * bad verdict, propagates so the turn fails closed.
 */
async function classify(text: string, ctx: TurnContext): Promise<GuardCategory> {
  const { deps, signal, meter } = ctx;
  const input = {
    ...buildGuardPrompt(text),
    maxTokens: LIMITS.maxTokensGuard,
    schema: GuardSchema,
    schemaName: "guard",
  };
  const ask = () =>
    reliably(deps, signal, (attemptSignal) =>
      deps.provider.structured(input, attemptSignal, meter),
    );
  try {
    return (await ask()).category;
  } catch (error) {
    if (!(error instanceof ProviderError) || error.code !== "invalid_structured_output") {
      throw error;
    }
    return (await ask()).category;
  }
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
