import { z } from "zod";
import {
  CURRENCIES,
  EMPLOYMENT_TYPES,
  JOB_STATUSES,
  PAY_FREQUENCIES,
  WORKPLACES,
  type EmploymentType,
  type Workplace,
} from "../enums.js";
import { LIMITS } from "../limits.js";
import { pageQuery } from "./common.js";
import type { PublicCompany } from "./employer.js";

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
  title: z.string().trim().min(LIMITS.jobTitleMinLength).max(LIMITS.jobTitleMaxLength),
  location: z.string().trim().min(LIMITS.jobLocationMinLength).max(LIMITS.jobLocationMaxLength),
  workplace: z.enum(WORKPLACES),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  /** Untrusted; the api sanitizes it before storing. */
  descriptionHtml: z.string().trim().min(1).max(LIMITS.jobDescriptionMaxChars),
  skills: z.array(z.string().trim().min(1).max(LIMITS.jobSkillMaxLength)).max(LIMITS.jobSkillsMax),
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

export interface PublicJobSummary {
  id: string;
  slug: string;
  title: string;
  location: string;
  workplace: Workplace;
  employmentType: EmploymentType;
  pay: JobPay;
  skills: string[];
  publishedAt: string | null;
  company: Pick<PublicCompany, "name" | "slug" | "logoUrl" | "verification">;
}

export interface PublicJob extends PublicJobSummary {
  /** Already sanitized by the api. */
  descriptionHtml: string;
}
