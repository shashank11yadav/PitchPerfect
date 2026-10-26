import { randomUUID } from "node:crypto";
import { createPracticeDeps } from "@pitchperfect/partner";
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from "fastify";
import type { DestinationStream } from "pino";
import { requireSignedRequests } from "./auth/guard.js";
import type { CoachConfig } from "./config.js";
import { registerErrorHandling } from "./errors.js";
import { createLogger } from "./logger.js";
import {
  createModerator,
  createProvider,
  type LlmProvider,
  type Moderator,
} from "./providers/index.js";
import { healthRoutes } from "./routes/health.js";
import { planRoute } from "./routes/plan.js";
import { scoreRoute } from "./routes/score.js";
import { turnRoute } from "./routes/turn.js";

const BODY_LIMIT_BYTES = 262_144;

export interface CoachAppOptions {
  config: CoachConfig;
  /** The LLM provider the practice routes call; defaults to `createProvider(config)`. */
  provider?: LlmProvider;
  /** What checks each reply sentence; defaults to `createModerator(config, provider)`. */
  moderator?: Moderator;
  /** Where log lines go; defaults to stdout. Tests pass a capture stream. */
  logStream?: DestinationStream;
}

/** Builds the coach service. Only `GET /healthz` is public; every other route needs an HMAC signature. */
export function buildCoachApp({
  config,
  provider = createProvider(config),
  moderator = createModerator(config, provider),
  logStream,
}: CoachAppOptions): FastifyInstance {
  const logger: FastifyBaseLogger = createLogger(config.LOG_LEVEL, logStream);
  const app = Fastify({
    loggerInstance: logger,
    // Fastify's request logging is replaced by the single line below: ids, route, status, timing.
    logController: new LogController({ disableRequestLogging: true }),
    genReqId: () => randomUUID(),
    bodyLimit: BODY_LIMIT_BYTES,
  });

  requireSignedRequests(app, config.COACH_SHARED_SECRET);
  registerErrorHandling(app);

  app.addHook("onResponse", (request, reply, done) => {
    request.log.info(
      {
        method: request.method,
        route: request.routeOptions.url ?? request.url.split("?")[0],
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
      },
      "request completed",
    );
    done();
  });

  healthRoutes(app, config);
  const deps = createPracticeDeps(config, provider, moderator);
  planRoute(app, deps);
  turnRoute(app, deps);
  scoreRoute(app, deps);
  return app;
}
