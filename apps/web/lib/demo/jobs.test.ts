import { SEED_JOBS } from "@pitchperfect/shared/seed-data";
import { describe, expect, it } from "vitest";
import { DEMO_JOBS, findDemoJob, findDemoJobById, listDemoJobs } from "./jobs";

const PAGE_SIZE = 20;

describe("the baked job board", () => {
  it("lists every active seed job, and only those, as the api would", () => {
    expect(DEMO_JOBS).toHaveLength(SEED_JOBS.filter((job) => job.status === "active").length);
    for (const { job, company } of DEMO_JOBS) {
      expect(job.slug).toMatch(/^[a-z0-9-]{1,100}$/);
      expect(job.id).toMatch(/^[a-f0-9]{24}$/);
      expect(job.company.name).toBe(company.name);
      expect(company.website).toMatch(/^https:\/\/[a-z-]+\.example$/);
      expect(company.verification).not.toBe("suspended");
    }
    expect(new Set(DEMO_JOBS.map(({ job }) => job.slug)).size).toBe(DEMO_JOBS.length);
  });

  it("uses the slugs the api seed gives the same jobs: the title, then the company", () => {
    const zentrova = DEMO_JOBS.filter(({ company }) => company.name === "Zentrova Analytics");
    expect(zentrova.map(({ job }) => job.slug)).toEqual([
      "sales-development-representative-zentrova-analytics",
      "account-executive-intern-zentrova-analytics",
    ]);
    expect(zentrova[0]?.company.slug).toBe("zentrova-analytics");
  });

  it("finds a job by slug and by id, and nothing for an unknown one", () => {
    const [first] = DEMO_JOBS;
    expect(first).toBeDefined();
    if (!first) return;
    expect(findDemoJob(first.job.slug)?.job.id).toBe(first.job.id);
    expect(findDemoJobById(first.job.id)?.job.slug).toBe(first.job.slug);
    expect(findDemoJob("nothing-here")).toBeUndefined();
  });

  it("answers the board's default query newest first, without descriptions", () => {
    const page = listDemoJobs({ page: 1 }, PAGE_SIZE);
    expect(page.total).toBe(DEMO_JOBS.length);
    expect(page.items.map((job) => job.publishedAt)).toEqual(
      [...page.items.map((job) => job.publishedAt)].sort().reverse(),
    );
    expect(page.items[0]).not.toHaveProperty("descriptionHtml");
  });

  it("filters by workplace and job type", () => {
    const remote = listDemoJobs({ page: 1, workplace: "remote" }, PAGE_SIZE);
    expect(remote.total).toBeGreaterThan(0);
    expect(remote.items.every((job) => job.workplace === "remote")).toBe(true);
    const interns = listDemoJobs({ page: 1, employmentType: "internship" }, PAGE_SIZE);
    expect(interns.items.every((job) => job.employmentType === "internship")).toBe(true);
    expect(
      listDemoJobs({ page: 1, workplace: "onsite", employmentType: "contract" }, PAGE_SIZE).total,
    ).toBe(0);
  });

  it("searches titles and skills by word start, better matches first", () => {
    const discovery = listDemoJobs({ page: 1, q: "discover" }, PAGE_SIZE);
    expect(discovery.total).toBeGreaterThan(0);
    for (const job of discovery.items) {
      expect([job.title, ...job.skills].join(" ")).toMatch(/discover/i);
    }
    const two = listDemoJobs({ page: 1, q: "sales discovery" }, PAGE_SIZE);
    const [best] = two.items;
    expect(best).toBeDefined();
    expect(`${best?.title ?? ""} ${best?.skills.join(" ") ?? ""}`).toMatch(/sales/i);
    expect(`${best?.title ?? ""} ${best?.skills.join(" ") ?? ""}`).toMatch(/discovery/i);
    expect(listDemoJobs({ page: 1, q: "zzzz" }, PAGE_SIZE).total).toBe(0);
  });

  it("pages the list", () => {
    const first = listDemoJobs({ page: 1 }, 5);
    const second = listDemoJobs({ page: 2 }, 5);
    expect(first.items).toHaveLength(5);
    expect(second.items).toHaveLength(5);
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    expect(listDemoJobs({ page: 9 }, 5)).toMatchObject({ items: [], total: DEMO_JOBS.length });
  });
});
