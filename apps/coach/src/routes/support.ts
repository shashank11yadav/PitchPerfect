import { createUsageMeter, ProviderError, usageOf, type PracticeDeps } from "@pitchperfect/partner";
import type { FastifyReply } from "fastify";
import type { ZodType } from "zod";
import { MeteredFailure, validationFailed } from "../errors.js";

type Meter = ReturnType<typeof createUsageMeter>;

/**
 * Runs a plan or score with a meter of its own. A provider failure is rethrown with what the
 * step's calls had used, which the error body reports.
 */
export async function metered<T>(
  deps: PracticeDeps,
  task: "plan" | "score",
  step: (meter: Meter) => Promise<T>,
): Promise<T> {
  const meter = createUsageMeter();
  try {
    return await step(meter);
  } catch (error) {
    if (error instanceof ProviderError) {
      throw new MeteredFailure(error, usageOf(deps, meter, task));
    }
    throw error;
  }
}

/** Validates a request body with a shared schema; failures never echo the body. */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw validationFailed();
  return result.data;
}

/** Aborts when the client disconnects before the response has finished. */
export function clientSignal(reply: FastifyReply): AbortSignal {
  const controller = new AbortController();
  reply.raw.on("close", () => {
    if (!reply.raw.writableFinished) controller.abort();
  });
  return controller.signal;
}
