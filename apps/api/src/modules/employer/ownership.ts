import type { RequestHandler, Response } from "express";
import type { Types } from "mongoose";
import { Application, Company, Job } from "../../db/models/index.js";
import type { ApplicationAttrs } from "../../db/models/application.js";
import type { CompanyAttrs } from "../../db/models/company.js";
import type { JobAttrs } from "../../db/models/job.js";
import { NotFoundError } from "../../errors.js";
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
