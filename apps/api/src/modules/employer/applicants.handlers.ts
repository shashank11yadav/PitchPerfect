import type { RequestHandler } from "express";
import type {
  ApplicationStatusUpdateSchema,
  EmployerApplicationListQuerySchema,
  InterviewSchema,
} from "@pitchperfect/shared";
import { getInput, type IdParamSchema } from "../../middleware/validate.js";
import { streamResume } from "../../services/files.js";
import type { Mailer } from "../../services/mailer.js";
import {
  assertNotWithdrawn,
  listApplicants,
  resumeForEmployer,
  scheduleInterview,
  setApplicationStatus,
  setSaved,
  sharedScorecard,
} from "./applicants.service.js";
import { companyOf, requireApplicationForEmployer, requireJobOwnedBy } from "./ownership.js";

interface Params {
  params: typeof IdParamSchema;
}

export function applicantsHandlers(deps: { mailer: Mailer }) {
  const owned = (res: Parameters<RequestHandler>[1]) =>
    requireApplicationForEmployer(companyOf(res)._id, getInput<Params>(res).params.id);

  return {
    list: (async (_req, res) => {
      const { params, query } = getInput<
        Params & { query: typeof EmployerApplicationListQuerySchema }
      >(res);
      const job = await requireJobOwnedBy(companyOf(res)._id, params.id);
      res.json(await listApplicants(job, query));
    }) satisfies RequestHandler,

    setStatus: (async (_req, res) => {
      const { body } = getInput<{ body: typeof ApplicationStatusUpdateSchema }>(res);
      const { application } = await owned(res);
      res.json({ application: await setApplicationStatus(application, body.status) });
    }) satisfies RequestHandler,

    save: (async (_req, res) => {
      await setSaved((await owned(res)).application, true);
      res.status(204).end();
    }) satisfies RequestHandler,

    unsave: (async (_req, res) => {
      await setSaved((await owned(res)).application, false);
      res.status(204).end();
    }) satisfies RequestHandler,

    interview: (async (req, res) => {
      const { body } = getInput<{ body: typeof InterviewSchema }>(res);
      const application = await scheduleInterview(
        deps.mailer,
        req.log,
        companyOf(res),
        await owned(res),
        body,
      );
      res.json({ application });
    }) satisfies RequestHandler,

    resume: (async (_req, res) => {
      const { application } = await owned(res);
      await streamResume(await resumeForEmployer(application), res);
    }) satisfies RequestHandler,

    scorecard: (async (_req, res) => {
      const { application } = await owned(res);
      assertNotWithdrawn(application);
      res.json(await sharedScorecard(application));
    }) satisfies RequestHandler,
  };
}
