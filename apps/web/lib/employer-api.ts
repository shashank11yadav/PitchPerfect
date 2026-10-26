import {
  PublicCompanySchema,
  type EmployerApplicationView,
  type EmployerDashboard,
  type EmployerJob,
  type EmployerJobSummary,
  type PublicCompany,
  type SharedScorecardView,
} from "@pitchperfect/shared";
import type { Parser } from "./api";
import { isObject, pageOf, unexpected } from "./parse";

/** Parsers for `/api/employer/*` answers (see `parse.ts` for how far each one checks). */

export const EmployerJobsPage = pageOf<EmployerJobSummary>("/employer/jobs");
export const ApplicantsPage = pageOf<EmployerApplicationView>("applications");

/** `{ company }` from `GET` and `PATCH /employer/company`. */
export const OneCompany: Parser<PublicCompany> = {
  parse(data) {
    if (isObject(data)) return PublicCompanySchema.parse(data.company);
    throw unexpected("/employer/company");
  },
};

export const Dashboard: Parser<EmployerDashboard> = {
  parse(data) {
    if (
      isObject(data) &&
      typeof data.activeJobs === "number" &&
      typeof data.drafts === "number" &&
      typeof data.applicants === "number" &&
      typeof data.interviewsUpcoming === "number" &&
      Array.isArray(data.recentApplications)
    ) {
      return data as unknown as EmployerDashboard;
    }
    throw unexpected("/employer/dashboard");
  },
};

/** `{ job }` from the job routes. */
export const OneJob: Parser<EmployerJob> = {
  parse(data) {
    if (
      isObject(data) &&
      isObject(data.job) &&
      typeof data.job.id === "string" &&
      typeof data.job.descriptionHtml === "string" &&
      isObject(data.job.pay)
    ) {
      return data.job as unknown as EmployerJob;
    }
    throw unexpected("job");
  },
};

/** `{ application }` from a status change or an interview. */
export const OneApplicant: Parser<EmployerApplicationView> = {
  parse(data) {
    if (isObject(data) && isObject(data.application) && isObject(data.application.student)) {
      return data.application as unknown as EmployerApplicationView;
    }
    throw unexpected("application");
  },
};

export const SharedScorecard: Parser<SharedScorecardView> = {
  parse(data) {
    if (isObject(data) && isObject(data.scorecard) && typeof data.skill === "string") {
      return data as unknown as SharedScorecardView;
    }
    throw unexpected("scorecard");
  },
};

/** Form wording for api refusals every employer write can meet. */
export const EMPLOYER_API_MESSAGES: Record<string, string> = {
  email_not_verified:
    "Confirm your email first. Posting jobs and managing applicants wait until you click the link we sent you.",
  company_suspended:
    "An admin suspended this company, so jobs and applicants are closed until the suspension is lifted.",
  company_unverified:
    "Only verified companies can send interview invites. The Company page explains how to get verified.",
};
