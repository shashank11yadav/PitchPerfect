import {
  createUsageMeter,
  InputError,
  ProviderError,
  runTurn,
  sanitizeInput,
  turnErrorCode,
  type PracticeDeps,
  type TurnContext,
  type TurnOutcome,
} from "@pitchperfect/partner";
import { CoachTurnRequestSchema, type Stage } from "@pitchperfect/shared";
import type { FastifyInstance } from "fastify";
import { validationFailed } from "../errors.js";
import { openSse } from "./sse.js";
import { clientSignal, parseBody } from "./support.js";

interface TurnResult {
  outcome: TurnOutcome | "error" | "aborted";
  stage?: Stage;
}

/**
 * `POST /v1/turn`: input check → the engine's turn (guard redirect, or the streamed persona reply
 * with the stage tag stripped and the output checked) → `done`. Errors before the stream starts
 * are JSON; after that they are an `error` event.
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
    const sink = openSse(reply.raw);
    const ctx: TurnContext = { deps, signal, sink, meter: createUsageMeter() };
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
      if (!signal.aborted) await sink.send({ type: "error", code: turnErrorCode(error) });
    } finally {
      sink.close();
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
