import { describe, expect, it } from "vitest";
import { SEED_COMPANIES, SEED_JOBS, seedCompanySlug, seedJobSlug } from "./seed-data.js";

describe("seed data", () => {
  it("names companies and jobs the way a job board would", () => {
    const [zentrova] = SEED_COMPANIES;
    if (!zentrova) throw new Error("no seed companies");
    expect(seedCompanySlug(zentrova)).toBe("zentrova-analytics");
    expect(seedJobSlug({ title: "Sales development representative" }, zentrova)).toBe(
      "sales-development-representative-zentrova-analytics",
    );
  });

  it("gives every company and every job its own slug", () => {
    const companySlugs = SEED_COMPANIES.map(seedCompanySlug);
    expect(new Set(companySlugs).size).toBe(SEED_COMPANIES.length);
    const jobSlugs = SEED_JOBS.map((job) => {
      const company = SEED_COMPANIES[job.company];
      if (!company) throw new Error(`"${job.title}" names a company that does not exist`);
      return seedJobSlug(job, company);
    });
    expect(new Set(jobSlugs).size).toBe(SEED_JOBS.length);
  });

  it("reads like real listings, on reserved domains only", () => {
    for (const company of SEED_COMPANIES) {
      expect(company.host).toMatch(/^[a-z-]+\.example$/);
      expect(company.pitch).not.toMatch(/made[- ]up|demo|fictional/i);
    }
    for (const job of SEED_JOBS) {
      // "Book demos" is sales work; a listing calling itself made up is not.
      expect(job.descriptionHtml).not.toMatch(/made[- ]up|fictional/i);
    }
  });
});
