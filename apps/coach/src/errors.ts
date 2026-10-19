import type { FastifyError, FastifyInstance } from "fastify";
import { ProviderError } from "./providers/index.js";

/** Error bodies match the api's shape: `{ error: { code, message, requestId } }`. */
const CODES: Record<number, { code: string; message: string }> = {
  400: { code: "validation_failed", message: "The request body is not valid" },
  404: { code: "not_found", message: "Not found" },
  413: { code: "payload_too_large", message: "The request body is too large" },
  415: { code: "unsupported_media_type", message: "Send application/json" },
};

/** A deliberate error response from a route. The message is fixed text, never request content. */
export class CoachError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CoachError";
  }
}

export const validationFailed = () =>
  new CoachError(400, "validation_failed", "The request body is not valid");

/** `practice_unavailable` (circuit open) is 503; every other provider failure is 502. */
function providerFailure(error: ProviderError): CoachError {
  return error.code === "practice_unavailable"
    ? new CoachError(503, "practice_unavailable", "The practice partner is unavailable right now")
    : new CoachError(502, "upstream_error", "The practice partner could not answer");
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    const { code, message } = CODES[404] ?? { code: "not_found", message: "Not found" };
    return reply.code(404).send({ error: { code, message, requestId: request.id } });
  });

  app.setErrorHandler((error: FastifyError | CoachError | ProviderError, request, reply) => {
    if (error instanceof ProviderError || error instanceof CoachError) {
      const known = error instanceof ProviderError ? providerFailure(error) : error;
      if (error instanceof ProviderError) {
        // Provider errors carry a code, never model or request text.
        request.log.warn({ providerError: error.code, status: error.status }, "provider failed");
      }
      return reply.code(known.statusCode).send({
        error: { code: known.code, message: known.message, requestId: request.id },
      });
    }

    const status = error.statusCode ?? 500;
    const known = status < 500 ? CODES[status] : undefined;
    if (status >= 500) {
      // The error object is logged; request bodies never are.
      request.log.error({ err: error }, "unhandled error");
    }
    const { code, message } = known ?? {
      code: status < 500 ? "bad_request" : "internal",
      message: status < 500 ? "The request could not be processed" : "Something went wrong",
    };
    return reply
      .code(known || status < 500 ? status : 500)
      .send({ error: { code, message, requestId: request.id } });
  });
}
