import { Router } from "express";
import { AttemptListQuerySchema, StartPracticeSchema, TurnSchema } from "@pitchperfect/shared";
import { requireConsent, requireRole, requireVerified } from "../../middleware/auth.js";
import { byUser, rateLimit } from "../../middleware/rate-limit.js";
import { IdParamSchema, validate } from "../../middleware/validate.js";
import { practiceHandlers } from "./handlers.js";
import type { PracticeDeps } from "./service.js";

const MINUTE_MS = 60 * 1000;

/** `/api/practice/*` per docs/api.md. Every route is for the signed-in student's own data. */
export function practiceRoutes(deps: PracticeDeps): Router {
  const handle = practiceHandlers(deps);
  const student = requireRole("student");
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
  const withId = validate({ params: IdParamSchema });

  const router = Router();
  router.get("/quota", student, handle.quota);
  router.post(
    "/sessions",
    student,
    requireVerified,
    requireConsent,
    startLimit,
    validate({ body: StartPracticeSchema }),
    handle.start,
  );
  router.get("/sessions/:id", student, withId, handle.get);
  router.post(
    "/sessions/:id/turns",
    student,
    turnLimit,
    validate({ params: IdParamSchema, body: TurnSchema }),
    handle.turn,
  );
  router.post("/sessions/:id/end", student, withId, handle.end);
  router.get("/attempts", student, validate({ query: AttemptListQuerySchema }), handle.list);
  router.delete("/attempts/:id", student, withId, handle.remove);
  return router;
}
