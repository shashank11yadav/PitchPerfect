import type { FastifyInstance, FastifyRequest } from "fastify";
import { verifySignature } from "./hmac.js";

declare module "fastify" {
  interface FastifyContextConfig {
    /** Routes that skip signature checks. Everything else requires a valid HMAC signature. */
    public?: boolean;
  }
}

class HttpError extends Error {
  constructor(readonly statusCode: number) {
    super(`HTTP ${String(statusCode)}`);
  }
}

const JSON_CONTENT_TYPE = /^application\/json\s*(;|$)/i;
const isJson = (request: FastifyRequest) =>
  JSON_CONTENT_TYPE.test(request.headers["content-type"] ?? "");

/** The path exactly as the caller sent it, without the query string. */
const sentPath = (request: FastifyRequest) => (request.raw.url ?? "").split("?", 1)[0] ?? "";

/**
 * Requires every request, except routes marked `config: { public: true }`, to carry a valid HMAC
 * signature over its raw body. The raw text is kept by the content-type parsers, verified in
 * `preValidation` (before any handler), and only then parsed as JSON, so unsigned callers cannot
 * reach the JSON parser or a handler.
 */
export function requireSignedRequests(app: FastifyInstance, secret: string): void {
  app.removeAllContentTypeParsers();
  const keepRaw = { parseAs: "string" } as const;
  const parser = (
    _request: FastifyRequest,
    body: string | Buffer,
    done: (error: null, body: string) => void,
  ) => {
    done(null, body.toString());
  };
  app.addContentTypeParser("application/json", keepRaw, parser);
  app.addContentTypeParser("*", keepRaw, parser);

  app.addHook("preValidation", async (request, reply) => {
    if (request.routeOptions.config.public) return;

    const raw = typeof request.body === "string" ? request.body : "";
    if (
      !verifySignature(
        secret,
        request.headers,
        { method: request.method, path: sentPath(request), body: raw },
        Date.now() / 1000,
      )
    ) {
      return reply.code(401).send({ error: { code: "unauthenticated" } });
    }
    if (raw === "") {
      request.body = undefined;
      return;
    }
    if (!isJson(request)) throw new HttpError(415);
    try {
      request.body = JSON.parse(raw) as unknown;
    } catch {
      throw new HttpError(400);
    }
  });
}
