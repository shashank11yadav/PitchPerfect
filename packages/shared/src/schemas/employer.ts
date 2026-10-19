import { z } from "zod";
import type { CompanyVerification, EmploymentType, JobStatus, Workplace } from "../enums.js";
import { LIMITS } from "../limits.js";
import type { EmployerRecentApplication } from "./applications.js";
import { httpsUrl, shortText } from "./common.js";
import type { JobPay } from "./jobs.js";

/** Company fields collected at employer signup; also editable later. */
export const companyFields = {
  name: shortText(),
  website: httpsUrl(),
  linkedinUrl: httpsUrl(),
};

export const CompanyUpdateSchema = z.strictObject({
  name: companyFields.name.optional(),
  website: companyFields.website.optional(),
  linkedinUrl: companyFields.linkedinUrl.nullable().optional(),
  pitch: z.string().trim().max(LIMITS.companyPitchMaxLength).optional(),
  logoUrl: httpsUrl().nullable().optional(),
});
export type CompanyUpdate = z.infer<typeof CompanyUpdateSchema>;

export interface PublicCompany {
  id: string;
  name: string;
  slug: string;
  website: string;
  linkedinUrl: string | null;
  pitch: string;
  logoUrl: string | null;
  verification: CompanyVerification;
}

export interface EmployerJobSummary {
  id: string;
  slug: string;
  title: string;
  location: string;
  workplace: Workplace;
  employmentType: EmploymentType;
  status: JobStatus;
  publishedAt: string | null;
  createdAt: string;
  applicantCount: number;
}

/** A job as its owner sees it: the summary plus everything editable. */
export interface EmployerJob extends EmployerJobSummary {
  /** Already sanitized by the api. */
  descriptionHtml: string;
  skills: string[];
  pay: JobPay;
}

export interface EmployerDashboard {
  activeJobs: number;
  drafts: number;
  /** Open applications (applied, shortlisted, interview) across all of the company's jobs. */
  applicants: number;
  interviewsUpcoming: number;
  /** The five newest applications. */
  recentApplications: EmployerRecentApplication[];
}
