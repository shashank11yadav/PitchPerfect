import { z } from "zod";
import {
  COMPANY_VERIFICATION,
  type EmploymentType,
  type JobStatus,
  type Workplace,
} from "../enums.js";
import { LIMITS } from "../limits.js";
import type { EmployerRecentApplication } from "./applications.js";
import { httpsUrl, shortText, visibleText } from "./common.js";
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
  pitch: visibleText().max(LIMITS.companyPitchMaxLength).optional(),
  logoUrl: httpsUrl().nullable().optional(),
});
export type CompanyUpdate = z.infer<typeof CompanyUpdateSchema>;

/** Response: a company as anyone may see it. Unknown keys are dropped, so the api can add fields. */
export const PublicCompanySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  website: z.string(),
  linkedinUrl: z.string().nullable(),
  pitch: z.string(),
  logoUrl: z.string().nullable(),
  verification: z.enum(COMPANY_VERIFICATION),
  /** The registrable domain the badge vouches for, e.g. "acme-demo.example"; null unless verified. */
  verifiedDomain: z.string().nullable(),
});
export type PublicCompany = z.infer<typeof PublicCompanySchema>;

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
