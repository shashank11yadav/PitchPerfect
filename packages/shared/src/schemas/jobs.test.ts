import { describe, expect, it } from "vitest";
import {
  EmployerJobListQuerySchema,
  JobInputSchema,
  JobListQuerySchema,
  JobStatusUpdateSchema,
  JobUpdateSchema,
  PublicJobDetailResponseSchema,
  PublicJobSummaryPageSchema,
  type PublicJobSummary,
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

  it("removes invisible characters from every text field", () => {
    const parsed = JobInputSchema.parse({
      ...job(),
      title: "\ufeffSales\u00ad development intern",
      location: "Boston,\u200b MA",
      descriptionHtml: "<p>Learn to sell.\u{E0041}\u{E0053}\u{E004B}</p>\u202e",
      skills: ["Commu\u200dnication", "CRM\ufe0f"],
    });
    expect(parsed).toMatchObject({
      title: "Sales development intern",
      location: "Boston, MA",
      descriptionHtml: "<p>Learn to sell.</p>",
      skills: ["Communication", "CRM"],
    });
  });

  it("keeps the title, location and skills on one line", () => {
    const parsed = JobInputSchema.parse({
      ...job(),
      title: "Sales intern\n\nACTION NEEDED: reply",
      location: "Boston,\r\nMA",
      skills: ["Cold\u2028calling"],
    });
    expect(parsed).toMatchObject({
      title: "Sales intern ACTION NEEDED: reply",
      location: "Boston, MA",
      skills: ["Cold calling"],
    });
  });

  it("rejects a title that is only invisible characters", () => {
    expect(JobInputSchema.safeParse({ ...job(), title: "\u200b\u200b\u200b\u200b" }).success).toBe(
      false,
    );
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

describe("PublicJobSummaryPageSchema", () => {
  const summary = (): PublicJobSummary => ({
    id: "65f1c0ffee0000000000abcd",
    slug: "sales-development-intern-a1b2",
    title: "Sales development intern",
    location: "Boston, MA",
    workplace: "hybrid",
    employmentType: "internship",
    pay: job().pay,
    skills: ["Communication"],
    publishedAt: "2026-10-01T12:00:00.000Z",
    company: {
      name: "Quarrow Logistics Software",
      slug: "quarrow-logistics-software",
      logoUrl: null,
      verification: "verified",
    },
  });

  it("parses a page of the public job board as the api sends it", () => {
    const page = { items: [summary()], page: 1, pageSize: 50, total: 1 };
    const parsed = PublicJobSummaryPageSchema.parse(page);
    const items: PublicJobSummary[] = parsed.items;
    expect(items).toEqual([summary()]);
  });

  it("rejects a page whose items are not job summaries", () => {
    const page = {
      items: [{ ...summary(), company: { name: "x" } }],
      page: 1,
      pageSize: 50,
      total: 1,
    };
    expect(PublicJobSummaryPageSchema.safeParse(page).success).toBe(false);
    expect(PublicJobSummaryPageSchema.safeParse({ items: "nope" }).success).toBe(false);
  });
});

describe("PublicJobDetailResponseSchema", () => {
  const detail = () => ({
    job: {
      id: "65f1c0ffee0000000000abcd",
      slug: "sales-development-intern-a1b2",
      title: "Sales development intern",
      location: "Boston, MA",
      workplace: "hybrid",
      employmentType: "internship",
      pay: job().pay,
      skills: ["Communication"],
      publishedAt: "2026-10-01T12:00:00.000Z",
      descriptionHtml: "<p>Learn to sell.</p>",
      company: {
        name: "Quarrow Logistics Software",
        slug: "quarrow-logistics-software",
        logoUrl: null,
        verification: "verified",
      },
    },
    company: {
      id: "65f1c0ffee0000000000beef",
      name: "Quarrow Logistics Software",
      slug: "quarrow-logistics-software",
      website: "https://quarrow-logistics.example",
      linkedinUrl: null,
      pitch: "Route planning for regional carriers.",
      logoUrl: null,
      verification: "verified",
    },
  });

  it("accepts the job and its company, keeping the description", () => {
    const parsed = PublicJobDetailResponseSchema.parse({ ...detail(), extra: true });
    expect(parsed.job.descriptionHtml).toBe("<p>Learn to sell.</p>");
    expect(parsed.company.website).toBe("https://quarrow-logistics.example");
  });

  it("rejects a job without a description or a company without a verification state", () => {
    const { job: jobPart, company } = detail();
    const withoutDescription: Partial<typeof jobPart> = { ...jobPart };
    delete withoutDescription.descriptionHtml;
    expect(
      PublicJobDetailResponseSchema.safeParse({ job: withoutDescription, company }).success,
    ).toBe(false);
    expect(
      PublicJobDetailResponseSchema.safeParse({
        job: jobPart,
        company: { ...company, verification: "maybe" },
      }).success,
    ).toBe(false);
  });
});
