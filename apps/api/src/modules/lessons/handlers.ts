import type { RequestHandler } from "express";
import type { LessonProgressSchema, SkillParamSchema } from "@pitchperfect/shared";
import { userOf } from "../../middleware/auth.js";
import { getInput } from "../../middleware/validate.js";
import { completedLessons, setLessonCompleted } from "./service.js";

export const lessonHandlers = {
  list: (async (_req, res) => {
    res.json({ completed: await completedLessons(userOf(res).id) });
  }) satisfies RequestHandler,

  set: (async (_req, res) => {
    const { params, body } = getInput<{
      params: typeof SkillParamSchema;
      body: typeof LessonProgressSchema;
    }>(res);
    res.json({ completed: await setLessonCompleted(userOf(res).id, params.skill, body.completed) });
  }) satisfies RequestHandler,
};
