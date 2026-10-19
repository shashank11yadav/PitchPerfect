import type { RequestHandler } from "express";
import type { JobListQuerySchema, pageQuery } from "@pitchperfect/shared";
import { userOf } from "../../middleware/auth.js";
import { getInput, type IdParamSchema } from "../../middleware/validate.js";
import type { SlugParamSchema } from "./routes.js";
import {
  getPublicJobBySlug,
  listPublicJobs,
  listSavedJobs,
  saveJob,
  unsaveJob,
} from "./service.js";

export const jobHandlers = {
  list: (async (_req, res) => {
    const { query } = getInput<{ query: typeof JobListQuerySchema }>(res);
    res.json(await listPublicJobs(query));
  }) satisfies RequestHandler,

  detail: (async (_req, res) => {
    const { params } = getInput<{ params: typeof SlugParamSchema }>(res);
    res.json(await getPublicJobBySlug(params.slug));
  }) satisfies RequestHandler,

  save: (async (_req, res) => {
    const { params } = getInput<{ params: typeof IdParamSchema }>(res);
    await saveJob(userOf(res).id, params.id);
    res.status(204).end();
  }) satisfies RequestHandler,

  unsave: (async (_req, res) => {
    const { params } = getInput<{ params: typeof IdParamSchema }>(res);
    await unsaveJob(userOf(res).id, params.id);
    res.status(204).end();
  }) satisfies RequestHandler,

  saved: (async (_req, res) => {
    const { query } = getInput<{ query: typeof pageQuery }>(res);
    res.json(await listSavedJobs(userOf(res).id, query));
  }) satisfies RequestHandler,
};
