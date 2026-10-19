import { describe, expect, it } from "vitest";
import {
  EmployerJobListQuerySchema,
  JobInputSchema,
  JobListQuerySchema,
  JobStatusUpdateSchema,
  JobUpdateSchema,
} from "./jobs.js";

const job = () => ({
  title: "Sales development intern",
  location: "Boston, MA",
  workplace: "hybrid" as const,
  employmentType: "internship" as const,
  descriptionHtml: "<p>Learn to sell.</p>",
  skills: ["Communication", "CRM"],
  pay: {
    type: "range" as const,
    min: 18,
    max: 24,
    currency: "USD" as const,
    frequency: "hourly" as const,
    commission: false,
  },
});

describe("JobInputSchema", () => {
  it("accepts a valid job", () => {
    expect(JobInputSchema.safeParse(job()).success).toBe(true);
    expect(JobInputSchema.safeParse({ ...job(), status: "active" }).success).toBe(true);
  });

  it("accepts exact and unpaid pay", () => {
    const exact = {
      type: "exact",
      amount: 20,
      currency: "CAD",
      frequency: "hourly",
      commission: true,
    };
    expect(JobInputSchema.safeParse({ ...job(), pay: exact }).success).toBe(true);
    expect(JobInputSchema.safeParse({ ...job(), pay: { type: "unpaid" } }).success).toBe(true);
  });

  it("rejects range pay without min/max or with min > max", () => {
    const base = { currency: "USD", frequency: "hourly", commission: false };
    for (const pay of [
      { type: "range", ...base },
      { type: "range", min: 10, ...base },
      { type: "range", max: 10, ...base },
      { type: "range", min: 30, max: 20, ...base },
    ]) {
      expect(JobInputSchema.safeParse({ ...job(), pay }).success, JSON.stringify(pay)).toBe(false);
    }
    const equal = { type: "range", min: 20, max: 20, ...base };
    expect(JobInputSchema.safeParse({ ...job(), pay: equal }).success).toBe(true);
  });

  it("rejects exact pay without an amount and unpaid pay with amounts", () => {
    const base = { currency: "USD", frequency: "hourly", commission: false };
    expect(JobInputSchema.safeParse({ ...job(), pay: { type: "exact", ...base } }).success).toBe(
      false,
    );
    expect(JobInputSchema.safeParse({ ...job(), pay: { type: "unpaid", amount: 5 } }).success).toBe(
      false,
    );
  });

  it("rejects unknown and server-owned keys", () => {
    expect(
      JobInputSchema.safeParse({ ...job(), companyId: "507f1f77bcf86cd799439011" }).success,
    ).toBe(false);
    expect(JobInputSchema.safeParse({ ...job(), applicants: 3 }).success).toBe(false);
    expect(JobInputSchema.safeParse({ ...job(), slug: "x" }).success).toBe(false);
  });

  it("limits skills to 15 items of 1–40 characters", () => {
    const skills = (n: number) => Array.from({ length: n }, (_, i) => `skill ${String(i)}`);
    expect(JobInputSchema.safeParse({ ...job(), skills: skills(15) }).success).toBe(true);
    expect(JobInputSchema.safeParse({ ...job(), skills: skills(16) }).success).toBe(false);
    expect(JobInputSchema.safeParse({ ...job(), skills: ["x".repeat(40)] }).success).toBe(true);
    expect(JobInputSchema.safeParse({ ...job(), skills: ["x".repeat(41)] }).success).toBe(false);
    expect(JobInputSchema.safeParse({ ...job(), skills: [""] }).success).toBe(false);
  });

  it("enforces text lengths and enums", () => {
    expect(JobInputSchema.safeParse({ ...job(), title: "ab" }).success).toBe(false);
    expect(JobInputSchema.safeParse({ ...job(), title: "t".repeat(121) }).success).toBe(false);
    expect(JobInputSchema.safeParse({ ...job(), location: "x" }).success).toBe(false);
    expect(JobInputSchema.safeParse({ ...job(), descriptionHtml: "" }).success).toBe(false);
    expect(
      JobInputSchema.safeParse({ ...job(), descriptionHtml: "x".repeat(20_001) }).success,
    ).toBe(false);
    expect(JobInputSchema.safeParse({ ...job(), workplace: "moon" }).success).toBe(false);
    expect(JobInputSchema.safeParse({ ...job(), status: "archived" }).success).toBe(false);
  });

  it("supports partial updates without inventing defaults", () => {
    const partial = JobInputSchema.partial();
    expect(partial.parse({})).toEqual({});
    expect(partial.parse({ title: "New title" })).toEqual({ title: "New title" });
    expect(partial.safeParse({ companyId: "x" }).success).toBe(false);
  });
});

describe("JobListQuerySchema", () => {
  it("combines filters with pagination", () => {
    expect(
      JobListQuerySchema.parse({ q: "sales", workplace: "remote", employmentType: "internship" }),
    ).toEqual({
      q: "sales",
      workplace: "remote",
      employmentType: "internship",
      page: 1,
      pageSize: 20,
    });
    expect(JobListQuerySchema.safeParse({ workplace: "moon" }).success).toBe(false);
    expect(JobListQuerySchema.safeParse({ sort: "x" }).success).toBe(false);
  });
});

describe("JobUpdateSchema", () => {
  it("accepts any subset of the content fields", () => {
    expect(JobUpdateSchema.parse({})).toEqual({});
    expect(JobUpdateSchema.safeParse({ title: "New title" }).success).toBe(true);
    expect(JobUpdateSchema.safeParse({ pay: { type: "unpaid" } }).success).toBe(true);
  });

  it("refuses status, slug, companyId, and applicants", () => {
    for (const extra of [
      { status: "active" },
      { slug: "x" },
      { companyId: "x" },
      { applicants: 1 },
    ]) {
      expect(JobUpdateSchema.safeParse(extra).success).toBe(false);
    }
  });

  it("still validates the fields it does accept", () => {
    expect(JobUpdateSchema.safeParse({ title: "" }).success).toBe(false);
  });
});

describe("JobStatusUpdateSchema", () => {
  it("takes exactly one known status", () => {
    for (const status of ["draft", "active", "archived"]) {
      expect(JobStatusUpdateSchema.safeParse({ status }).success).toBe(true);
    }
    expect(JobStatusUpdateSchema.safeParse({ status: "closed" }).success).toBe(false);
    expect(JobStatusUpdateSchema.safeParse({}).success).toBe(false);
    expect(JobStatusUpdateSchema.safeParse({ status: "active", slug: "x" }).success).toBe(false);
  });
});

describe("EmployerJobListQuerySchema", () => {
  it("paginates and filters by status", () => {
    expect(EmployerJobListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(EmployerJobListQuerySchema.parse({ status: "draft", page: "2" })).toMatchObject({
      status: "draft",
      page: 2,
    });
    expect(EmployerJobListQuerySchema.safeParse({ status: "nope" }).success).toBe(false);
  });
});
