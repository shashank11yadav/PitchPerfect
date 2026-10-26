import type {
  EmployerApplicationView,
  EmployerDashboard,
  EmployerJob,
  PublicCompany,
  SharedScorecardView,
} from "@pitchperfect/shared";
import { publicCompany } from "@/components/jobs/test-fixtures";
import type { Session } from "@/lib/session";
import { meBody } from "@/lib/test-api";

/** Fictional employer-side data for tests; the company is the seed's coined demo name. */

export const JOB_ID = "65f1c0ffee0000000000abcd";
export const APPLICATION_ID = "65f1c0ffee00000000000a01";

export function company(overrides: Partial<PublicCompany> = {}): PublicCompany {
  return publicCompany({
    name: "Pitchwell Demo Hiring Co",
    slug: "pitchwell-demo-hiring-co",
    website: "https://pitchwell-demo.example",
    linkedinUrl: null,
    pitch: "A made-up company for trying out PitchPerfect as an employer.",
    ...overrides,
  });
}

/** A signed-in employer of `owned`, for `ProvideSession` around components that read the session. */
export function employerSession(owned = company()): Session {
  const { user } = meBody("employer");
  return {
    status: "signed_in",
    user,
    profile: { jobTitle: "Head of talent", companyId: owned.id },
    company: owned,
    refresh: () => Promise.resolve("signed_in"),
    signOut: () => Promise.resolve(),
    leaving: false,
  };
}

export function employerJob(overrides: Partial<EmployerJob> = {}): EmployerJob {
  return {
    id: JOB_ID,
    slug: "sales-development-representative-a1b2c3",
    title: "Sales development representative",
    location: "Remote, US",
    workplace: "remote",
    employmentType: "full_time",
    status: "draft",
    publishedAt: null,
    createdAt: "2026-10-12T15:00:00.000Z",
    applicantCount: 0,
    descriptionHtml:
      "<p>Open conversations with operations teams.</p><ul><li><p>Book demos</p></li></ul>",
    skills: ["Cold outreach", "Follow-up"],
    pay: {
      type: "range",
      min: 50_000,
      max: 58_000,
      currency: "USD",
      frequency: "annually",
      commission: true,
    },
    ...overrides,
  };
}

export function applicant(
  overrides: Partial<EmployerApplicationView> = {},
): EmployerApplicationView {
  return {
    id: APPLICATION_ID,
    status: "applied",
    appliedAt: "2026-10-14T15:00:00.000Z",
    savedByEmployer: false,
    student: {
      firstName: "Riley",
      lastName: "Hartwell",
      school: "Lakeview State University",
      major: "Marketing",
      gradYear: 2027,
    },
    hasResume: false,
    hasSharedScorecard: false,
    interview: null,
    ...overrides,
  };
}

export function dashboard(overrides: Partial<EmployerDashboard> = {}): EmployerDashboard {
  return {
    activeJobs: 2,
    drafts: 1,
    applicants: 3,
    interviewsUpcoming: 1,
    recentApplications: [
      { ...applicant(), jobId: JOB_ID, jobTitle: "Sales development representative" },
    ],
    ...overrides,
  };
}

export function sharedScorecard(): SharedScorecardView {
  const dimension = (key: string, name: string) => ({
    key,
    score: 4,
    justification: `${name} was steady across the call.`,
    evidence: "How do you track delays today?",
  });
  return {
    skill: "pitching",
    completedAt: "2026-10-16T15:00:00.000Z",
    scorecard: {
      overall: 72,
      dimensions: [
        dimension("clarity", "Clarity"),
        dimension("value", "Value"),
        dimension("discovery", "Discovery"),
        dimension("objections", "Objections"),
        dimension("cta", "Call to action"),
        dimension("confidence", "Confidence"),
        dimension("structure", "Structure"),
      ],
      strengths: [
        "You asked how they track delays now.",
        "You named a real cost.",
        "You asked for a time.",
      ],
      improvements: ["Cut the opener short.", "Ask one more question.", "Pause after the price."],
      strongerLine: {
        original: "So, um, we do dashboards.",
        improved: "We flag late loads early.",
      },
    } as SharedScorecardView["scorecard"],
  };
}
