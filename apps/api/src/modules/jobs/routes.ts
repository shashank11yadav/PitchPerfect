import { Router } from "express";
import { z } from "zod";
import { JobListQuerySchema, MINUTE_MS, pageQuery } from "@pitchperfect/shared";
import { requireRole } from "../../middleware/auth.js";
import { byIp, rateLimit } from "../../middleware/rate-limit.js";
import { IdParamSchema, validate } from "../../middleware/validate.js";
import { jobHandlers } from "./handlers.js";

const SLUG_MAX_LENGTH = 100;

export const SlugParamSchema = z.strictObject({ slug: z.string().min(1).max(SLUG_MAX_LENGTH) });

/** Public job board and saved jobs, per docs/api.md. */
export function jobRoutes(): Router {
  const publicLimit = rateLimit("public-jobs", { windowMs: MINUTE_MS, limit: 120, key: byIp });
  const student = requireRole("student");

  const router = Router();
  router.get("/jobs", publicLimit, validate({ query: JobListQuerySchema }), jobHandlers.list);
  router.get("/jobs/:slug", publicLimit, validate({ params: SlugParamSchema }), jobHandlers.detail);
  router.put("/jobs/:id/save", student, validate({ params: IdParamSchema }), jobHandlers.save);
  router.delete("/jobs/:id/save", student, validate({ params: IdParamSchema }), jobHandlers.unsave);
  router.get("/me/saved-jobs", student, validate({ query: pageQuery }), jobHandlers.saved);
  return router;
}
