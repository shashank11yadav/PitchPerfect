import {
  SEED_COMPANIES,
  SEED_JOBS,
  type SeedCompany,
  type SeedJob,
} from "@pitchperfect/shared/seed-data";

/** A seeded job with its company, as the marketing pictures show it. */
export interface SampleJob extends Omit<SeedJob, "company"> {
  company: SeedCompany;
}

/**
 * An active job from the seed data, found by company and title, so the pictures on the public
 * pages show the same jobs, companies and pay as the job board. A seed change that drops one
 * fails the build here instead of leaving a picture of a job that doesn't exist.
 */
function seededJob(companyName: string, title: string): SampleJob {
  const index = SEED_COMPANIES.findIndex((company) => company.name === companyName);
  const company = SEED_COMPANIES[index];
  const job = SEED_JOBS.find(
    (candidate) =>
      candidate.company === index && candidate.title === title && candidate.status === "active",
  );
  if (!company || !job) throw new Error(`The seed data has no active "${title}" at ${companyName}`);
  return { ...job, company };
}

/** The employers page's one hiring story: the job post, its applicants and the interview invite. */
export const HIRING_JOB = seededJob("Zentrova Analytics", "Sales development representative");

/** The job the home page's applicant list belongs to. */
export const HOME_APPLICANTS_JOB = seededJob("Cedarloom Realty Tech", "Account executive intern");

/** The job a student applies to with a scorecard, in the home page's steps. */
export const APPLIED_JOB = seededJob(
  "Quarrow Logistics Software",
  "Business development representative",
);

/** The job a student practices for, on the students page. */
export const PRACTICE_JOB = seededJob(
  "Lumivale Learning Systems",
  "Sales development representative",
);

/** Two listings as candidates see them: one verified company, one not yet. */
export const SAMPLE_LISTINGS: readonly SampleJob[] = [
  seededJob("Halvane Health Cloud", "Customer success associate"),
  seededJob("Orvexa Payments", "Business development representative"),
];
