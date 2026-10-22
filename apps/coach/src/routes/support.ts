import type { FastifyReply } from "fastify";
import type { ZodType } from "zod";
import { validationFailed } from "../errors.js";

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
