import type { RequestHandler, Response } from "express";
import type { Types } from "mongoose";
import { Application, Company, Job } from "../../db/models/index.js";
import type { ApplicationAttrs } from "../../db/models/application.js";
import type { CompanyAttrs } from "../../db/models/company.js";
import type { JobAttrs } from "../../db/models/job.js";
import { ForbiddenError, NotFoundError } from "../../errors.js";
import { userOf } from "../../middleware/auth.js";

export type CompanyDoc = CompanyAttrs & { _id: Types.ObjectId };
export type JobDoc = JobAttrs & { _id: Types.ObjectId };
export type ApplicationDoc = ApplicationAttrs & { _id: Types.ObjectId };

/** Loads the signed-in employer's company once per request. */
export const withCompany: RequestHandler = async (_req, res, next) => {
  const company = await Company.findOne({ ownerId: userOf(res).id }).lean();
  if (!company) throw new NotFoundError();
  res.locals.company = company;
  next();
};

/** The company `withCompany` loaded for this request. */
export function companyOf(res: Response): CompanyDoc {
  return res.locals.company as CompanyDoc;
}

/**
 * Closes the route to a suspended company: no applicants, résumés, scorecards or invites, and no
 * job changes. Mounted once in the employer router, so every route registered after it inherits it.
 */
export const refuseSuspended: RequestHandler = (_req, res, next) => {
  if (companyOf(res).verification === "suspended") {
    throw new ForbiddenError(
      "company_suspended",
      "An admin suspended this company, so its jobs and applicants are closed until the suspension is lifted",
    );
  }
  next();
};

/** Interview invites email a student a link, so only a verified company may send them. */
export const requireVerifiedCompany: RequestHandler = (_req, res, next) => {
  if (companyOf(res).verification !== "verified") {
    throw new ForbiddenError(
      "company_unverified",
      "Only verified companies can send interview invites",
    );
  }
  next();
};

/** The job, if it belongs to this company. Someone else's job looks exactly like a missing one. */
export async function requireJobOwnedBy(
  employerCompanyId: Types.ObjectId,
  jobId: string,
): Promise<JobDoc> {
  const job = await Job.findOne({ _id: jobId, companyId: employerCompanyId }).lean();
  if (!job) throw new NotFoundError();
  return job;
}

/** The application and its job, if the job belongs to this company; otherwise 404. */
export async function requireApplicationForEmployer(
  employerCompanyId: Types.ObjectId,
  applicationId: string,
): Promise<{ application: ApplicationDoc; job: JobDoc }> {
  const application = await Application.findById(applicationId).lean();
  if (!application) throw new NotFoundError();
  const job = await requireJobOwnedBy(employerCompanyId, application.jobId.toString());
  return { application, job };
}
