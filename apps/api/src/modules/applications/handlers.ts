import type { RequestHandler } from "express";
import type { ApplySchema, pageQuery } from "@pitchperfect/shared";
import { ConflictError } from "../../errors.js";
import { userOf } from "../../middleware/auth.js";
import { getInput, type IdParamSchema } from "../../middleware/validate.js";
import { applyToJob, listStudentApplications, withdrawApplication } from "./service.js";

export const applicationHandlers = {
  apply: (async (_req, res) => {
    const { params, body } = getInput<{ params: typeof IdParamSchema; body: typeof ApplySchema }>(
      res,
    );
    const result = await applyToJob(userOf(res).id, params.id, body.sharedAttemptId);
    if (!result.created) throw new ConflictError("already_applied", "You've already applied");
    res.status(201).json({ application: result.application });
  }) satisfies RequestHandler,

  list: (async (_req, res) => {
    const { query } = getInput<{ query: typeof pageQuery }>(res);
    res.json(await listStudentApplications(userOf(res).id, query));
  }) satisfies RequestHandler,

  withdraw: (async (_req, res) => {
    const { params } = getInput<{ params: typeof IdParamSchema }>(res);
    res.json({ application: await withdrawApplication(userOf(res).id, params.id) });
  }) satisfies RequestHandler,
};
