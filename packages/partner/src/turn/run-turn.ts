import { LIMITS, type CoachTurnRequest, type Stage } from "@pitchperfect/shared";
import { reliably, usageOf } from "../deps.js";
import { confirmsAttack, ruleCheck } from "../guardrails/guard-rules.js";
import { signalsSelfHarm } from "../guardrails/self-harm.js";
import { redirectLine, SUPPORT_LINE } from "../prompts/fixed-lines.js";
import { buildGuardPrompt, GuardSchema, type GuardCategory } from "../prompts/guard.js";
import { studentTurnNumber } from "../prompts/persona-turn.js";
import { ProviderError } from "../provider.js";
import { personaReply, type TurnContext } from "./persona-reply.js";

export type TurnOutcome = "done" | "fallback" | "redirect" | "support";

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

interface Verdict {
  category: GuardCategory;
  /** A confirmed attack, which counts toward ending the session. */
  strike: boolean;
}

const isAttack = (category: GuardCategory) =>
  category === "prompt_attack" || category === "harmful";

/**
 * The guards' verdict. A rule hit only makes a line suspect; it is a strike once a second check
 * agrees: the model guard with a live provider, or the stricter `confirmsAttack` for the scripted
 * one. A line the rules leave alone goes to the model guard, whose verdict alone never strikes.
 */
async function judge(text: string, ctx: TurnContext): Promise<Verdict> {
  const suspect = ruleCheck(text);
  if (suspect === null) return { category: await classify(text, ctx), strike: false };
  if (ctx.deps.provider.name === "fake") return { category: suspect, strike: confirmsAttack(text) };
  const second = await classify(text, ctx);
  if (second === "self_harm") return { category: second, strike: false };
  return isAttack(second)
    ? { category: second, strike: true }
    : { category: suspect, strike: false };
}

/** PitchPerfect, out of character: crisis resources instead of a reply. Never a strike. */
async function support(ctx: TurnContext): Promise<TurnResult> {
  const usage = usageOf(ctx.deps, ctx.meter, "turn");
  await ctx.sink.send({ type: "support", text: SUPPORT_LINE, usage });
  return { outcome: "support" };
}

/**
 * One student turn, already validated. A turn that signals self-harm, by the rules or the model
 * guard, gets the `support` message and nothing else. Otherwise: rule and model guard (a fixed
 * `redirect` line when the text is off the call, with `strike` set for a confirmed attack), else
 * the streamed persona reply (`delta` events, then `done` with the checked final text and the
 * stage). A provider failure propagates; the host turns it into its own `error` event.
 */
export async function runTurn(turn: CoachTurnRequest, ctx: TurnContext): Promise<TurnResult> {
  // Before any guard or model call: someone who may be at risk is never redirected or struck.
  if (signalsSelfHarm(turn.studentText)) return support(ctx);
  const { category, strike } = await judge(turn.studentText, ctx);
  if (category === "self_harm") return support(ctx);
  if (category !== "ok") {
    const text = redirectLine(category, studentTurnNumber(turn.transcript) - 1);
    const usage = usageOf(ctx.deps, ctx.meter, "turn");
    await ctx.sink.send({ type: "redirect", text, strike, usage });
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
