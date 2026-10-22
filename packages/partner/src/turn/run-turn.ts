import { LIMITS, type CoachTurnRequest, type Stage } from "@pitchperfect/shared";
import { reliably, usageOf } from "../deps.js";
import { ruleCheck } from "../guardrails/guard-rules.js";
import { redirectLine } from "../prompts/fixed-lines.js";
import { buildGuardPrompt, GuardSchema, type GuardCategory } from "../prompts/guard.js";
import { studentTurnNumber } from "../prompts/persona-turn.js";
import { ProviderError } from "../provider.js";
import { personaReply, type TurnContext } from "./persona-reply.js";

export type TurnOutcome = "done" | "fallback" | "redirect";

export interface TurnResult {
  outcome: TurnOutcome;
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

/**
 * One student turn, already validated: rule and model guard (a fixed `redirect` line when the
 * text is off the call), else the streamed persona reply (`delta` events, then `done` with the
 * checked final text and the stage). A provider failure propagates; the host turns it into its
 * own `error` event.
 */
export async function runTurn(turn: CoachTurnRequest, ctx: TurnContext): Promise<TurnResult> {
  const category = ruleCheck(turn.studentText) ?? (await classify(turn.studentText, ctx));
  if (category !== "ok") {
    const text = redirectLine(category, studentTurnNumber(turn.transcript) - 1);
    await ctx.sink.send({ type: "redirect", text, usage: usageOf(ctx.deps, ctx.meter, "turn") });
    return { outcome: "redirect" };
  }
  const result = await personaReply(turn, ctx);
  await ctx.sink.send({
    type: "done",
    stage: result.stage,
    finalText: result.text,
    usage: usageOf(ctx.deps, ctx.meter, "turn"),
  });
  return { outcome: result.outcome, stage: result.stage };
}

/** The error code a failed turn reports: the breaker is open, or the provider failed. */
export const turnErrorCode = (error: unknown): "practice_unavailable" | "upstream_error" =>
  error instanceof ProviderError && error.code === "practice_unavailable"
    ? "practice_unavailable"
    : "upstream_error";
