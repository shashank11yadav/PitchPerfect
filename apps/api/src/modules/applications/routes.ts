import { Router } from "express";
import { ApplySchema, pageQuery, ShareScorecardSchema } from "@pitchperfect/shared";
import { requireRole, requireVerified } from "../../middleware/auth.js";
import { IdParamSchema, validate } from "../../middleware/validate.js";
import { applicationHandlers } from "./handlers.js";

/** Student side of applications, per docs/api.md. */
export function applicationRoutes(): Router {
  const student = requireRole("student");

  const router = Router();
  router.post(
    "/jobs/:id/apply",
    student,
    requireVerified,
    validate({ params: IdParamSchema, body: ApplySchema }),
    applicationHandlers.apply,
  );
  router.get("/me/applications", student, validate({ query: pageQuery }), applicationHandlers.list);
  router.post(
    "/applications/:id/withdraw",
    student,
    validate({ params: IdParamSchema }),
    applicationHandlers.withdraw,
  );
  router.put(
    "/applications/:id/scorecard",
    student,
    validate({ params: IdParamSchema, body: ShareScorecardSchema }),
    applicationHandlers.shareScorecard,
  );
  return router;
}
