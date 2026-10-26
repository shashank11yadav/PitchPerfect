import { Router } from "express";
import {
  AttemptListQuerySchema,
  MINUTE_MS,
  StartPracticeSchema,
  TurnSchema,
} from "@pitchperfect/shared";
import { requireConsent, requireRole, requireVerified } from "../../middleware/auth.js";
import { byIp, byUser, rateLimit } from "../../middleware/rate-limit.js";
import { IdParamSchema, validate } from "../../middleware/validate.js";
import { practicePartnerOf } from "../../services/coach-probe.js";
import { practiceHandlers } from "./handlers.js";
import type { PracticeDeps } from "./service.js";

/**
 * `/api/practice/*` per docs/api.md. Every route but the public partner disclosure is for the
 * signed-in student's own data.
 */
export function practiceRoutes(deps: PracticeDeps): Router {
  const handle = practiceHandlers(deps);
  const student = requireRole("student");
  // Public and unauthenticated, like the job board: the legal pages ask for it as they render.
  const partnerLimit = rateLimit("practice-partner", {
    windowMs: MINUTE_MS,
    limit: 120,
    key: byIp,
  });
  const startLimit = rateLimit("practice-start", {
    windowMs: 60 * MINUTE_MS,
    limit: 10,
    key: byUser,
  });
  const turnLimit = rateLimit("practice-turn", {
    windowMs: 10 * MINUTE_MS,
    limit: 60,
    key: byUser,
  });
  const endLimit = rateLimit("practice-end", { windowMs: 10 * MINUTE_MS, limit: 20, key: byUser });
  const withId = validate({ params: IdParamSchema });
  const consented = requireConsent(async () => practicePartnerOf(await deps.coachProbe()));

  const router = Router();
  router.get("/partner", partnerLimit, handle.partner);
  router.get("/quota", student, handle.quota);
  router.post(
    "/sessions",
    student,
    requireVerified,
    consented,
    startLimit,
    validate({ body: StartPracticeSchema }),
    handle.start,
  );
  router.get("/sessions/:id", student, withId, handle.get);
  router.post(
    "/sessions/:id/turns",
    student,
    validate({ params: IdParamSchema, body: TurnSchema }),
    // A student in crisis is answered before the rate limit or any other refusal.
    handle.support,
    turnLimit,
    handle.turn,
  );
  router.post("/sessions/:id/end", student, endLimit, withId, handle.end);
  router.get("/attempts", student, validate({ query: AttemptListQuerySchema }), handle.list);
  router.delete("/attempts/:id", student, withId, handle.remove);
  return router;
}
