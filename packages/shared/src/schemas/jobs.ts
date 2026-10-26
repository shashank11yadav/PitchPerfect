import { z } from "zod";
import {
  COMPANY_VERIFICATION,
  CURRENCIES,
  EMPLOYMENT_TYPES,
  JOB_STATUSES,
  PAY_FREQUENCIES,
  WORKPLACES,
} from "../enums.js";
import { LIMITS } from "../limits.js";
import { pageQuery, pageSchema, singleLineText, visibleText } from "./common.js";
import { PublicCompanySchema } from "./employer.js";

const money = () => z.number().positive().max(LIMITS.payMax);

const payTerms = {
  currency: z.enum(CURRENCIES),
  frequency: z.enum(PAY_FREQUENCIES),
  commission: z.boolean(),
};

export const PaySchema = z.discriminatedUnion("type", [
  z
    .strictObject({ type: z.literal("range"), min: money(), max: money(), ...payTerms })
    .refine((pay) => pay.min <= pay.max, {
      message: "Minimum pay must not exceed maximum pay",
      path: ["max"],
    }),
  z.strictObject({ type: z.literal("exact"), amount: money(), ...payTerms }),
  z.strictObject({ type: z.literal("unpaid") }),
]);
export type JobPay = z.infer<typeof PaySchema>;

export const JobInputSchema = z.strictObject({
  title: singleLineText().min(LIMITS.jobTitleMinLength).max(LIMITS.jobTitleMaxLength),
  location: singleLineText().min(LIMITS.jobLocationMinLength).max(LIMITS.jobLocationMaxLength),
  workplace: z.enum(WORKPLACES),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  /** Untrusted; the api sanitizes it before storing. */
  descriptionHtml: visibleText().min(1).max(LIMITS.jobDescriptionMaxChars),
  skills: z.array(singleLineText().min(1).max(LIMITS.jobSkillMaxLength)).max(LIMITS.jobSkillsMax),
  pay: PaySchema,
  /** Omitted means "draft" on create. Archiving goes through the status endpoint. */
  status: z.enum(["draft", "active"]).optional(),
});
export type JobInput = z.infer<typeof JobInputSchema>;

/** Editing a job: any subset of the content fields. Status changes use `JobStatusUpdateSchema`. */
export const JobUpdateSchema = JobInputSchema.omit({ status: true }).partial();
export type JobUpdate = z.infer<typeof JobUpdateSchema>;

export const JobStatusUpdateSchema = z.strictObject({ status: z.enum(JOB_STATUSES) });
export type JobStatusUpdate = z.infer<typeof JobStatusUpdateSchema>;

/** Employer's jobs list: optionally one status. */
export const EmployerJobListQuerySchema = pageQuery.extend({
  status: z.enum(JOB_STATUSES).optional(),
});
export type EmployerJobListQuery = z.infer<typeof EmployerJobListQuerySchema>;

export const JobListQuerySchema = pageQuery.extend({
  q: z.string().trim().max(LIMITS.jobSearchMaxLength).optional(),
  workplace: z.enum(WORKPLACES).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
});
export type JobListQuery = z.infer<typeof JobListQuerySchema>;

/** Response: one job on the public board. Unknown keys are dropped, so the api can add fields. */
export const PublicJobSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  location: z.string(),
  workplace: z.enum(WORKPLACES),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  pay: PaySchema,
  skills: z.array(z.string()),
  publishedAt: z.string().nullable(),
  company: z.object({
    name: z.string(),
    slug: z.string(),
    logoUrl: z.string().nullable(),
    verification: z.enum(COMPANY_VERIFICATION),
    /** The registrable domain the badge vouches for, e.g. "acme-demo.example"; null unless verified. */
    verifiedDomain: z.string().nullable(),
  }),
});
export type PublicJobSummary = z.infer<typeof PublicJobSummarySchema>;

/** Response of `GET /api/jobs`. */
export const PublicJobSummaryPageSchema = pageSchema(PublicJobSummarySchema);

/** Response: one job's full listing. `descriptionHtml` was sanitized by the api. */
const PublicJobSchema = PublicJobSummarySchema.extend({ descriptionHtml: z.string() });
export type PublicJob = z.infer<typeof PublicJobSchema>;

/** Response of `GET /api/jobs/:slug`. */
export const PublicJobDetailResponseSchema = z.object({
  job: PublicJobSchema,
  company: PublicCompanySchema,
});
