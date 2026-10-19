import { model, Schema, type Types } from "mongoose";
import {
  CURRENCIES,
  EMPLOYMENT_TYPES,
  JOB_STATUSES,
  PAY_FREQUENCIES,
  PAY_TYPES,
  WORKPLACES,
  type Currency,
  type EmploymentType,
  type JobStatus,
  type PayFrequency,
  type PayType,
  type Workplace,
} from "@pitchperfect/shared";
import { schemaOptions } from "../schema-options.js";

/** Stored loosely; the shared `PaySchema` decides which combinations are valid on write. */
export interface StoredPay {
  type: PayType;
  min?: number;
  max?: number;
  amount?: number;
  currency?: Currency;
  frequency?: PayFrequency;
  commission?: boolean;
}

export interface JobAttrs {
  companyId: Types.ObjectId;
  slug: string;
  title: string;
  location: string;
  workplace: Workplace;
  employmentType: EmploymentType;
  descriptionHtml: string;
  skills: string[];
  pay: StoredPay;
  status: JobStatus;
  publishedAt?: Date;
  closesAt?: Date;
  /** Set by mongoose timestamps. */
  createdAt: Date;
  updatedAt: Date;
}

const paySchema = new Schema<StoredPay>(
  {
    type: { type: String, enum: PAY_TYPES, required: true },
    min: Number,
    max: Number,
    amount: Number,
    currency: { type: String, enum: CURRENCIES },
    frequency: { type: String, enum: PAY_FREQUENCIES },
    commission: Boolean,
  },
  { _id: false },
);

const jobSchema = new Schema<JobAttrs>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    workplace: { type: String, enum: WORKPLACES, required: true },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES, required: true },
    descriptionHtml: { type: String, required: true },
    skills: { type: [String], default: [] },
    pay: { type: paySchema, required: true },
    status: { type: String, enum: JOB_STATUSES, default: "draft" },
    publishedAt: Date,
    closesAt: Date,
  },
  schemaOptions(),
);

jobSchema.index({ companyId: 1, status: 1 });
jobSchema.index({ status: 1, publishedAt: -1 });
jobSchema.index({ title: "text", skills: "text" });

export const Job = model<JobAttrs>("Job", jobSchema);
