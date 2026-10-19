import { Router } from "express";
import { LessonProgressSchema, SkillParamSchema } from "@pitchperfect/shared";
import { requireRole } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { lessonHandlers } from "./handlers.js";

/** `/api/me/lessons` per docs/api.md. */
export function lessonRoutes(): Router {
  const router = Router();
  router.get("/me/lessons", requireRole("student"), lessonHandlers.list);
  router.put(
    "/me/lessons/:skill",
    requireRole("student"),
    validate({ params: SkillParamSchema, body: LessonProgressSchema }),
    lessonHandlers.set,
  );
  return router;
}
