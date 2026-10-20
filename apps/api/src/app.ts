import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import type { DestinationStream } from "pino";
import { pinoHttp } from "pino-http";
import { LIMITS } from "@pitchperfect/shared";
import type { Config } from "./config.js";
import { createLogger } from "./logger.js";
import { createCsrf } from "./middleware/csrf.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFound } from "./middleware/not-found.js";
import { originCheck } from "./middleware/origin-check.js";
import { proxyGuard } from "./middleware/proxy-guard.js";
import { requestId, requestIdOf } from "./middleware/request-id.js";
import { sessionMiddleware } from "./middleware/session.js";
import { applicationRoutes } from "./modules/applications/routes.js";
import { authRoutes } from "./modules/auth/routes.js";
import { employerRoutes } from "./modules/employer/routes.js";
import { healthRoutes } from "./modules/health/routes.js";
import { jobRoutes } from "./modules/jobs/routes.js";
import { lessonRoutes } from "./modules/lessons/routes.js";
import { practiceRoutes } from "./modules/practice/routes.js";
import { profileRoutes } from "./modules/profile/routes.js";
import type { CoachClient } from "./services/coach-client.js";
import type { Mailer } from "./services/mailer.js";

const logLevelFor = (status: number) => (status >= 500 ? "error" : status >= 400 ? "warn" : "info");

/** The matched route pattern (`/api/health`), never the raw URL, so ids and tokens stay out of logs. */
function routeOf(req: express.Request): string | undefined {
  const route = req.route as { path?: unknown } | undefined;
  return typeof route?.path === "string" ? req.baseUrl + route.path : undefined;
}

export interface AppDeps {
  config: Config;
  coach?: CoachClient;
  mailer: Mailer;
  now?: () => Date;
  /** Where request logs go; defaults to stdout. Tests pass a capture stream. */
  logStream?: DestinationStream;
}

/**
 * Builds the Express app without listening. `extraRoutes` registers additional `/api` routes ahead
 * of the not-found handler (used by tests).
 */
export function createApp(
  deps: AppDeps,
  extraRoutes?: (router: express.Router) => void,
): express.Express {
  const { config } = deps;
  const app = express();

  app.set("trust proxy", config.TRUST_PROXY);
  app.disable("x-powered-by");

  app.use(requestId);
  app.use(
    pinoHttp({
      logger: createLogger(config.LOG_LEVEL, deps.logStream),
      genReqId: (req) => req.id,
      // Log only what docs/security.md allows: ids, route, method, status, timing.
      serializers: {
        req: (req: express.Request) => ({ id: req.id, method: req.method }),
        res: (res: express.Response) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res) => logLevelFor(res.statusCode),
      // Called when the request starts and again when it finishes; add fields on completion only.
      customProps: (req, res) =>
        res.writableFinished
          ? {
              requestId: requestIdOf(res as express.Response),
              route: routeOf(req as express.Request),
            }
          : {},
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      strictTransportSecurity: config.isProd,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    }),
  );
  if (config.PROXY_SHARED_SECRET) app.use(proxyGuard(config.PROXY_SHARED_SECRET));
  app.use(express.json({ limit: LIMITS.jsonBodyMaxBytes }));

  // After body parsing, before any route: cookies, then the session, then the CSRF checks that
  // depend on it (the origin check first because it is cheap).
  const csrf = createCsrf(config);
  app.use(cookieParser());
  app.use(sessionMiddleware(config, () => mongoose.connection.getClient()));
  app.use(originCheck(config));
  app.use(csrf.csrfProtection);

  const api = express.Router();
  api.use(authRoutes({ config, mailer: deps.mailer, csrf }));
  api.use(profileRoutes({ config, mailer: deps.mailer }));
  api.use(lessonRoutes());
  api.use(jobRoutes());
  api.use(applicationRoutes());
  api.use("/practice", practiceRoutes({ config, coach: deps.coach }));
  api.use("/employer", employerRoutes({ mailer: deps.mailer }));
  api.use(healthRoutes(deps.coach));
  extraRoutes?.(api);
  app.use("/api", api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
