import type { FastifyInstance } from "fastify";
import type { CoachConfig } from "../config.js";

/** `GET /healthz` is the only unsigned route, so orchestrators can probe it. */
export function healthRoutes(
  app: FastifyInstance,
  config: Pick<CoachConfig, "COACH_PROVIDER">,
): void {
  app.get("/healthz", { exposeHeadRoute: false, config: { public: true } }, () => ({
    status: "ok",
    provider: config.COACH_PROVIDER,
  }));
}
