import { Router } from "express";
import {
  ApplicationStatusUpdateSchema,
  CompanyUpdateSchema,
  EmployerApplicationListQuerySchema,
  EmployerJobListQuerySchema,
  InterviewSchema,
  JobInputSchema,
  JobStatusUpdateSchema,
  JobUpdateSchema,
} from "@pitchperfect/shared";
import { requireRole, requireVerified } from "../../middleware/auth.js";
import { byUser, rateLimit } from "../../middleware/rate-limit.js";
import { IdParamSchema, validate } from "../../middleware/validate.js";
import type { Mailer } from "../../services/mailer.js";
import { applicantsHandlers } from "./applicants.handlers.js";
import { companyHandlers } from "./company.handlers.js";
import { dashboardHandlers } from "./dashboard.handlers.js";
import { jobsHandlers } from "./jobs.handlers.js";
import { withCompany } from "./ownership.js";

const MINUTE_MS = 60 * 1000;
const WRITES_PER_MINUTE = 60;

/**
 * `/api/employer/*` per docs/api.md. Everything needs an employer with a company; writes also
 * need a verified email and count against a per-user limit. Resources are looked up through the
 * ownership helpers, so another company's ids are indistinguishable from missing ones.
 */
export function employerRoutes(deps: { mailer: Mailer }): Router {
  const jobs = jobsHandlers(deps);
  const applicants = applicantsHandlers(deps);
  const writeLimit = rateLimit("employer-writes", {
    windowMs: MINUTE_MS,
    limit: WRITES_PER_MINUTE,
    key: byUser,
  });
  const write = [requireVerified, writeLimit];

  const router = Router();
  router.use(requireRole("employer"), withCompany);

  router.get("/company", companyHandlers.get);
  router.patch("/company", write, validate({ body: CompanyUpdateSchema }), companyHandlers.update);
  router.get("/dashboard", dashboardHandlers.get);

  router.get("/jobs", validate({ query: EmployerJobListQuerySchema }), jobs.list);
  router.post("/jobs", write, validate({ body: JobInputSchema }), jobs.create);
  router.get("/jobs/:id", validate({ params: IdParamSchema }), jobs.get);
  router.patch(
    "/jobs/:id",
    write,
    validate({ params: IdParamSchema, body: JobUpdateSchema }),
    jobs.update,
  );
  router.post(
    "/jobs/:id/status",
    write,
    validate({ params: IdParamSchema, body: JobStatusUpdateSchema }),
    jobs.setStatus,
  );
  router.delete("/jobs/:id", write, validate({ params: IdParamSchema }), jobs.remove);
  router.get(
    "/jobs/:id/applications",
    validate({ params: IdParamSchema, query: EmployerApplicationListQuerySchema }),
    applicants.list,
  );

  const application = validate({ params: IdParamSchema });
  router.patch(
    "/applications/:id",
    write,
    validate({ params: IdParamSchema, body: ApplicationStatusUpdateSchema }),
    applicants.setStatus,
  );
  router.put("/applications/:id/save", write, application, applicants.save);
  router.delete("/applications/:id/save", write, application, applicants.unsave);
  router.post(
    "/applications/:id/interview",
    write,
    validate({ params: IdParamSchema, body: InterviewSchema }),
    applicants.interview,
  );
  router.get("/applications/:id/resume", application, applicants.resume);
  router.get("/applications/:id/scorecard", application, applicants.scorecard);
  return router;
}
