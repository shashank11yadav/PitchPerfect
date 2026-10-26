import type { RequestHandler } from "express";
import type {
  EmployerJobListQuerySchema,
  JobInputSchema,
  JobStatusUpdateSchema,
  JobUpdateSchema,
} from "@pitchperfect/shared";
import { getInput, type IdParamSchema } from "../../middleware/validate.js";
import type { LinkingMailer, MailFailureLog } from "../../services/mailer.js";
import {
  changeJobStatus,
  createJob,
  deleteJob,
  listJobs,
  updateJob,
  viewJob,
} from "./jobs.service.js";
import { companyOf, requireJobOwnedBy } from "./ownership.js";

interface Params {
  params: typeof IdParamSchema;
}

/** Thin handlers: validated input in, service call, response out. */
export function jobsHandlers(deps: LinkingMailer) {
  const owned = (res: Parameters<RequestHandler>[1]) =>
    requireJobOwnedBy(companyOf(res)._id, getInput<Params>(res).params.id);

  return {
    create: (async (_req, res) => {
      const { body } = getInput<{ body: typeof JobInputSchema }>(res);
      res.status(201).json({ job: await createJob(companyOf(res), body) });
    }) satisfies RequestHandler,

    list: (async (_req, res) => {
      const { query } = getInput<{ query: typeof EmployerJobListQuerySchema }>(res);
      res.json(await listJobs(companyOf(res), query));
    }) satisfies RequestHandler,

    get: (async (_req, res) => {
      res.json({ job: await viewJob(await owned(res)) });
    }) satisfies RequestHandler,

    update: (async (_req, res) => {
      const { body } = getInput<{ body: typeof JobUpdateSchema }>(res);
      res.json({ job: await updateJob(await owned(res), body) });
    }) satisfies RequestHandler,

    setStatus: (async (req, res) => {
      const { body } = getInput<{ body: typeof JobStatusUpdateSchema }>(res);
      const log: MailFailureLog = req.log;
      const job = await changeJobStatus(deps, log, companyOf(res), await owned(res), body.status);
      res.json({ job });
    }) satisfies RequestHandler,

    remove: (async (_req, res) => {
      await deleteJob(await owned(res));
      res.status(204).end();
    }) satisfies RequestHandler,
  };
}
