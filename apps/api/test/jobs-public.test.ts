import request from "supertest";
import { describe, expect, it } from "vitest";
import type { Page, PublicJob, PublicJobSummary } from "@pitchperfect/shared";
import { Company, SavedJob } from "../src/db/models/index.js";
import { makeTestApp } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import { createEmployer, createJob, createStudent, signIn } from "./helpers/factories.js";

useTestDb();

const { app } = makeTestApp();

const pageOf = (res: { body: unknown }) => res.body as Page<PublicJobSummary>;
const titlesOf = (res: { body: unknown }) => pageOf(res).items.map((job) => job.title);

async function studentSession() {
  const { email, password, user } = await createStudent();
  return { session: await signIn(request.agent(app), email, password), user };
}

describe("GET /api/jobs", () => {
  it("lists only active jobs of companies that are not suspended", async () => {
    const open = await createEmployer();
    const unverified = await createEmployer({ companyVerified: false });
    const suspended = await createEmployer();
    await Company.updateOne({ _id: suspended.company._id }, { verification: "suspended" });
    await createJob(open.company._id, { title: "Open role" });
    await createJob(open.company._id, { title: "Draft role", status: "draft" });
    await createJob(open.company._id, { title: "Archived role", status: "archived" });
    await createJob(unverified.company._id, { title: "Unverified role" });
    await createJob(suspended.company._id, { title: "Suspended role" });

    const res = await request(app).get("/api/jobs");

    expect(res.status).toBe(200);
    expect(titlesOf(res).sort()).toEqual(["Open role", "Unverified role"]);
    expect(pageOf(res)).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    const unverifiedJob = pageOf(res).items.find((job) => job.title === "Unverified role");
    expect(unverifiedJob?.company).toMatchObject({
      name: unverified.company.name,
      slug: unverified.company.slug,
      verification: "unverified",
    });
  });

  it("returns summaries without the description", async () => {
    const { company } = await createEmployer();
    await createJob(company._id);

    const res = await request(app).get("/api/jobs");

    const [item] = pageOf(res).items;
    expect(Object.keys(item ?? {}).sort()).toEqual([
      "company",
      "employmentType",
      "id",
      "location",
      "pay",
      "publishedAt",
      "skills",
      "slug",
      "title",
      "workplace",
    ]);
    expect(Object.keys(item?.company ?? {}).sort()).toEqual([
      "logoUrl",
      "name",
      "slug",
      "verification",
    ]);
  });

  it("orders by publish date, newest first", async () => {
    const { company } = await createEmployer();
    await createJob(company._id, { title: "Older", publishedAt: new Date("2026-01-01") });
    await createJob(company._id, { title: "Newest", publishedAt: new Date("2026-03-01") });
    await createJob(company._id, { title: "Middle", publishedAt: new Date("2026-02-01") });

    expect(titlesOf(await request(app).get("/api/jobs"))).toEqual(["Newest", "Middle", "Older"]);
  });

  it("searches titles and skills with q", async () => {
    const { company } = await createEmployer();
    await createJob(company._id, { title: "Account executive" });
    await createJob(company._id, { title: "Barista", skills: ["negotiation"] });
    await createJob(company._id, { title: "Warehouse helper" });

    expect(titlesOf(await request(app).get("/api/jobs").query({ q: "executive" }))).toEqual([
      "Account executive",
    ]);
    expect(titlesOf(await request(app).get("/api/jobs").query({ q: "negotiation" }))).toEqual([
      "Barista",
    ]);
  });

  it("ranks better text matches first when q is given", async () => {
    const { company } = await createEmployer();
    await createJob(company._id, {
      title: "Sales assistant",
      publishedAt: new Date("2026-03-01"),
    });
    await createJob(company._id, {
      title: "Sales sales sales",
      skills: ["sales"],
      publishedAt: new Date("2026-01-01"),
    });

    const titles = titlesOf(await request(app).get("/api/jobs").query({ q: "sales" }));

    expect(titles[0]).toBe("Sales sales sales");
  });

  it("treats operator-looking input as plain search text", async () => {
    const { company } = await createEmployer();
    await createJob(company._id);

    const res = await request(app).get("/api/jobs").query({ q: '{"$ne":null}' });

    expect(res.status).toBe(200);
    expect(pageOf(res).total).toBe(0);
  });

  it("filters by workplace and employment type", async () => {
    const { company } = await createEmployer();
    await createJob(company._id, { title: "Remote full", workplace: "remote" });
    await createJob(company._id, {
      title: "Onsite intern",
      workplace: "onsite",
      employmentType: "internship",
    });

    const onsite = await request(app).get("/api/jobs").query({ workplace: "onsite" });
    expect(titlesOf(onsite)).toEqual(["Onsite intern"]);
    const interns = await request(app).get("/api/jobs").query({ employmentType: "internship" });
    expect(titlesOf(interns)).toEqual(["Onsite intern"]);
    const none = await request(app)
      .get("/api/jobs")
      .query({ workplace: "remote", employmentType: "internship" });
    expect(pageOf(none).total).toBe(0);
  });

  it("paginates with correct totals and caps pageSize at 50", async () => {
    const { company } = await createEmployer();
    for (let i = 0; i < 5; i += 1) {
      await createJob(company._id, {
        title: `Role ${String(i)}`,
        publishedAt: new Date(2026, 0, i + 1),
      });
    }

    const second = await request(app).get("/api/jobs").query({ page: 2, pageSize: 2 });
    expect(titlesOf(second)).toEqual(["Role 2", "Role 1"]);
    expect(pageOf(second)).toMatchObject({ page: 2, pageSize: 2, total: 5 });

    const tooBig = await request(app).get("/api/jobs").query({ pageSize: 51 });
    expect(tooBig.status).toBe(400);
    expect(errorOf(tooBig).code).toBe("validation_failed");

    const pastEnd = await request(app).get("/api/jobs").query({ page: 9 });
    expect(pageOf(pastEnd)).toMatchObject({ items: [], total: 5 });
  });

  it("rejects unknown query parameters", async () => {
    const res = await request(app).get("/api/jobs").query({ status: "draft" });
    expect(res.status).toBe(400);
  });
});

describe("public job rate limit", () => {
  it("answers 429 after 120 requests a minute from one address", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 121; i += 1) statuses.push((await request(app).get("/api/jobs")).status);

    expect(statuses.slice(0, 120).every((status) => status === 200)).toBe(true);
    expect(statuses[120]).toBe(429);
  });
});

describe("GET /api/jobs/:slug", () => {
  it("returns the job and its company", async () => {
    const { company } = await createEmployer({ companyVerified: false });
    const job = await createJob(company._id, { title: "Detail role", skills: ["calling"] });

    const res = await request(app).get(`/api/jobs/${job.slug}`);

    const body = res.body as { job: PublicJob; company: { slug: string; verification: string } };
    expect(res.status).toBe(200);
    expect(body.job).toMatchObject({
      id: job._id.toString(),
      slug: job.slug,
      title: "Detail role",
      skills: ["calling"],
    });
    expect(body.job.descriptionHtml).toContain("Fictional role");
    expect(body.company).toMatchObject({ slug: company.slug, verification: "unverified" });
  });

  it("is a 404 for draft, archived, and missing jobs and for suspended companies", async () => {
    const { company } = await createEmployer();
    const draft = await createJob(company._id, { status: "draft" });
    const archived = await createJob(company._id, { status: "archived" });
    const suspended = await createEmployer();
    const hidden = await createJob(suspended.company._id);
    await Company.updateOne({ _id: suspended.company._id }, { verification: "suspended" });

    for (const slug of [draft.slug, archived.slug, hidden.slug, "no-such-job-abc123"]) {
      const res = await request(app).get(`/api/jobs/${slug}`);
      expect(res.status).toBe(404);
      expect(errorOf(res).code).toBe("not_found");
    }
  });
});

describe("saved jobs", () => {
  it("saves and unsaves idempotently", async () => {
    const { company } = await createEmployer();
    const job = await createJob(company._id);
    const { session, user } = await studentSession();

    expect((await session.put(`/api/jobs/${job._id.toString()}/save`)).status).toBe(204);
    expect((await session.put(`/api/jobs/${job._id.toString()}/save`)).status).toBe(204);
    expect(await SavedJob.countDocuments({ studentId: user._id })).toBe(1);

    expect((await session.delete(`/api/jobs/${job._id.toString()}/save`)).status).toBe(204);
    expect((await session.delete(`/api/jobs/${job._id.toString()}/save`)).status).toBe(204);
    expect(await SavedJob.countDocuments({ studentId: user._id })).toBe(0);
  });

  it("saves one document under parallel requests", async () => {
    const { company } = await createEmployer();
    const job = await createJob(company._id);
    const { session, user } = await studentSession();

    const results = await Promise.all([
      session.put(`/api/jobs/${job._id.toString()}/save`),
      session.put(`/api/jobs/${job._id.toString()}/save`),
    ]);

    expect(results.map((res) => res.status)).toEqual([204, 204]);
    expect(await SavedJob.countDocuments({ studentId: user._id })).toBe(1);
  });

  it("404s when saving a job that isn't public", async () => {
    const { company } = await createEmployer();
    const draft = await createJob(company._id, { status: "draft" });
    const { session } = await studentSession();

    const res = await session.put(`/api/jobs/${draft._id.toString()}/save`);
    expect(res.status).toBe(404);
    const bad = await session.put("/api/jobs/not-an-id/save");
    expect(bad.status).toBe(400);
  });

  it("requires a signed-in student", async () => {
    const { company, email, password } = await createEmployer();
    const job = await createJob(company._id);
    const path = `/api/jobs/${job._id.toString()}/save`;

    const anonymous = await request(app).get("/api/me/saved-jobs");
    expect(anonymous.status).toBe(401);
    const employer = await signIn(request.agent(app), email, password);
    expect((await employer.put(path)).status).toBe(403);
    expect((await employer.agent.get("/api/me/saved-jobs")).status).toBe(403);
  });

  it("lists saved jobs newest-saved first, paginated, hiding jobs that are no longer public", async () => {
    const { company } = await createEmployer();
    const first = await createJob(company._id, { title: "First saved" });
    const second = await createJob(company._id, { title: "Second saved" });
    const third = await createJob(company._id, { title: "Third saved" });
    const gone = await createJob(company._id, { title: "Later archived" });
    const { session } = await studentSession();
    for (const job of [first, gone, second, third]) {
      await session.put(`/api/jobs/${job._id.toString()}/save`);
    }
    await gone.updateOne({ status: "archived" });

    const all = await session.agent.get("/api/me/saved-jobs");
    expect(titlesOf(all)).toEqual(["Third saved", "Second saved", "First saved"]);
    expect(pageOf(all).total).toBe(3);

    const paged = await session.agent.get("/api/me/saved-jobs").query({ page: 2, pageSize: 2 });
    expect(titlesOf(paged)).toEqual(["First saved"]);
    expect(pageOf(paged)).toMatchObject({ page: 2, pageSize: 2, total: 3 });
  });

  it("only lists the caller's own saved jobs", async () => {
    const { company } = await createEmployer();
    const job = await createJob(company._id);
    const alice = await studentSession();
    const bob = await studentSession();
    await alice.session.put(`/api/jobs/${job._id.toString()}/save`);

    expect(pageOf(await bob.session.agent.get("/api/me/saved-jobs")).total).toBe(0);
  });
});
