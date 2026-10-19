import type { FastifyError, FastifyInstance } from "fastify";

/** Error bodies match the api's shape: `{ error: { code, message, requestId } }`. */
const CODES: Record<number, { code: string; message: string }> = {
  400: { code: "validation_failed", message: "The request body is not valid" },
  404: { code: "not_found", message: "Not found" },
  413: { code: "payload_too_large", message: "The request body is too large" },
  415: { code: "unsupported_media_type", message: "Send application/json" },
};

export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    const { code, message } = CODES[404] ?? { code: "not_found", message: "Not found" };
    return reply.code(404).send({ error: { code, message, requestId: request.id } });
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
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
