import type { Types } from "mongoose";
import type {
  AttemptSummary,
  AttemptView,
  EmployerProfileView,
  JobPay,
  PublicCompany,
  PublicJob,
  PublicJobSummary,
  PublicUser,
  StudentApplicationView,
  StudentProfileView,
} from "@pitchperfect/shared";
import type { ApplicationAttrs } from "./models/application.js";
import type { CompanyAttrs } from "./models/company.js";
import type { EmployerProfileAttrs } from "./models/employer-profile.js";
import type { JobAttrs, StoredPay } from "./models/job.js";
import type { PracticeAttemptAttrs } from "./models/practice-attempt.js";
import type { StudentProfileAttrs } from "./models/student-profile.js";
import type { UserAttrs } from "./models/user.js";

/** Both hydrated documents and lean results satisfy this. */
type Persisted<T> = T & { _id: Types.ObjectId };

const iso = (date: Date | null | undefined): string | null => date?.toISOString() ?? null;

export function toPublicUser(user: Persisted<UserAttrs>): PublicUser {
  return {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    firstName: user.name.first,
    lastName: user.name.last,
    emailVerifiedAt: iso(user.emailVerifiedAt),
    practiceConsentAt: iso(user.practiceConsentAt),
  };
}

export function toStudentProfileView(profile: StudentProfileAttrs): StudentProfileView {
  return {
    school: profile.school,
    major: profile.major,
    gradYear: profile.gradYear,
    targetRole: profile.targetRole,
    industry: profile.industry,
    state: profile.state,
    hasResume: profile.resumeFileId != null,
    lessonsCompleted: [...profile.lessonsCompleted],
  };
}

export function toEmployerProfileView(profile: EmployerProfileAttrs): EmployerProfileView {
  return { jobTitle: profile.jobTitle, companyId: profile.companyId.toString() };
}

export function toPublicCompany(company: Persisted<CompanyAttrs>): PublicCompany {
  return {
    id: company._id.toString(),
    name: company.name,
    slug: company.slug,
    website: company.website,
    linkedinUrl: company.linkedinUrl ?? null,
    pitch: company.pitch,
    logoUrl: company.logoUrl ?? null,
    verification: company.verification,
  };
}

/** Copies only the fields that belong to the pay type. */
function toJobPay(pay: StoredPay): JobPay {
  if (pay.type === "unpaid") return { type: "unpaid" };
  const terms = {
    currency: pay.currency ?? "USD",
    frequency: pay.frequency ?? "hourly",
    commission: pay.commission ?? false,
  };
  return pay.type === "exact"
    ? { type: "exact", amount: pay.amount ?? 0, ...terms }
    : { type: "range", min: pay.min ?? 0, max: pay.max ?? 0, ...terms };
}

export function toPublicJobSummary(
  job: Persisted<JobAttrs>,
  company: Persisted<CompanyAttrs>,
): PublicJobSummary {
  const { name, slug, logoUrl, verification } = toPublicCompany(company);
  return {
    id: job._id.toString(),
    slug: job.slug,
    title: job.title,
    location: job.location,
    workplace: job.workplace,
    employmentType: job.employmentType,
    pay: toJobPay(job.pay),
    skills: [...job.skills],
    publishedAt: iso(job.publishedAt),
    company: { name, slug, logoUrl, verification },
  };
}

export function toPublicJob(job: Persisted<JobAttrs>, company: Persisted<CompanyAttrs>): PublicJob {
  return { ...toPublicJobSummary(job, company), descriptionHtml: job.descriptionHtml };
}

/** An application with the job fields recorded when it was made; `jobSlug` only while the job is listed. */
export function toStudentApplicationView(
  application: Persisted<ApplicationAttrs>,
  jobSlug: string | null,
): StudentApplicationView {
  return {
    id: application._id.toString(),
    status: application.status,
    closedReason: application.closedReason,
    appliedAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
    job: {
      id: application.jobId.toString(),
      slug: jobSlug,
      title: application.jobSnapshot.title,
      companyName: application.jobSnapshot.companyName,
    },
    interview: application.interview
      ? {
          startsAt: application.interview.startsAt.toISOString(),
          meetingUrl: application.interview.meetingUrl,
        }
      : null,
    hasSharedScorecard: application.sharedAttemptId != null,
  };
}

/** Never includes `scenarioPrivate`: fields are copied by name, not spread. */
export function toAttemptView(attempt: Persisted<PracticeAttemptAttrs>): AttemptView {
  const { personaName, personaTitle, companyType, personality, openingLine } =
    attempt.scenarioPublic;
  return {
    id: attempt._id.toString(),
    skill: attempt.skill,
    jobId: attempt.jobId?.toString() ?? null,
    status: attempt.status,
    scenarioPublic: { personaName, personaTitle, companyType, personality, openingLine },
    transcript: attempt.transcript.map((entry) => ({
      role: entry.role,
      text: entry.text,
      at: entry.at.toISOString(),
      flagged: entry.flagged,
    })),
    scorecard: attempt.scorecard,
    startedAt: attempt.startedAt.toISOString(),
    endedAt: iso(attempt.endedAt),
    expiresAt: attempt.expiresAt.toISOString(),
  };
}

export function toAttemptSummary(attempt: Persisted<PracticeAttemptAttrs>): AttemptSummary {
  return {
    id: attempt._id.toString(),
    skill: attempt.skill,
    status: attempt.status,
    overall: attempt.scorecard?.overall ?? null,
    startedAt: attempt.startedAt.toISOString(),
    endedAt: iso(attempt.endedAt),
  };
}
