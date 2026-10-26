import type { Router } from "express";
import { describe, expect, it } from "vitest";
import { Application, Company, Job } from "../src/db/models/index.js";
import { employerRoutes } from "../src/modules/employer/routes.js";
import { makeTestApp } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import { createApplication, createJob } from "./helpers/factories.js";
import { tinyPdf } from "./helpers/pdf.js";
import { call, employerSession, studentSession, type Method } from "./helpers/sessions.js";

useTestDb();

const { app, config, mailer } = makeTestApp();

interface RouteCase {
  method: Method;
  /** Express path as registered, relative to `/api/employer`. */
  path: string;
  body?: object;
}

const JOB = {
  title: "Account executive",
  location: "Remote",
  workplace: "remote",
  employmentType: "full_time",
  descriptionHtml: "<p>Fictional role.</p>",
  skills: [],
  pay: { type: "unpaid" },
};

/** Every employer route but `GET /company`. The table test fails if the router has one more. */
const BLOCKED: RouteCase[] = [
  { method: "patch", path: "/company", body: { pitch: "Still here" } },
  { method: "get", path: "/dashboard" },
  { method: "get", path: "/jobs" },
  { method: "post", path: "/jobs", body: JOB },
  { method: "get", path: "/jobs/:id" },
  { method: "patch", path: "/jobs/:id", body: { title: "Edited while suspended" } },
  { method: "post", path: "/jobs/:id/status", body: { status: "active" } },
  { method: "delete", path: "/jobs/:id" },
  { method: "get", path: "/jobs/:id/applications" },
  { method: "patch", path: "/applications/:id", body: { status: "rejected" } },
  { method: "put", path: "/applications/:id/save" },
  { method: "delete", path: "/applications/:id/save" },
  {
    method: "post",
    path: "/applications/:id/interview",
    body: { startsAt: "2099-01-01T10:00:00Z", meetingUrl: "https://zoom.us/j/1" },
  },
  { method: "get", path: "/applications/:id/resume" },
  { method: "get", path: "/applications/:id/scorecard" },
];

const key = ({ method, path }: RouteCase) => `${method.toUpperCase()} ${path}`;

function registered(router: Router): string[] {
  const layers = router.stack as { route?: { path: string; methods: Record<string, boolean> } }[];
  return layers.flatMap(({ route }) =>
    route
      ? Object.keys(route.methods).map((method) => `${method.toUpperCase()} ${route.path}`)
      : [],
  );
}

async function suspendedWorld() {
  const employer = await employerSession(app);
  const job = await createJob(employer.company._id, { status: "archived" });
  const student = await studentSession(app);
  await student.session.put("/api/me/resume").attach("file", tinyPdf(), "cv.pdf").expect(200);
  const application = await createApplication({
    jobId: job._id,
    studentId: student.user._id,
    status: "shortlisted",
  });
  await Company.updateOne({ _id: employer.company._id }, { verification: "suspended" });
  return { ...employer, job, application };
}

describe("a suspended company", () => {
  it("lists every employer route but GET /company as blocked", () => {
    const routes = registered(employerRoutes({ mailer, config }));
    expect([...BLOCKED.map(key), "GET /company"].sort()).toEqual(routes.sort());
  });

  it("gets 403 company_suspended on every other employer route and changes nothing", async () => {
    const { session, job, application } = await suspendedWorld();

    for (const route of BLOCKED) {
      const id = route.path.startsWith("/jobs") ? job.id : application.id;
      const res = await call(
        session,
        route.method,
        `/api/employer${route.path.replace(":id", id)}`,
        route.body,
      );
      expect(res.status, key(route)).toBe(403);
      expect(errorOf(res).code, key(route)).toBe("company_suspended");
      expect(JSON.stringify(res.body), key(route)).not.toMatch(/Taylor|Example State/);
    }

    expect(await Job.countDocuments()).toBe(1);
    expect((await Job.findById(job._id))?.status).toBe("archived");
    expect(await Application.findById(application._id)).toMatchObject({
      status: "shortlisted",
      savedByEmployer: false,
    });
    expect(mailer.sent).toHaveLength(0);
  });

  it("can still read its own company, which says it is suspended", async () => {
    const { session } = await suspendedWorld();

    const res = await session.agent.get("/api/employer/company");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ company: { verification: "suspended" } });
  });

  it("gets access back when an admin lifts the suspension", async () => {
    const { session, company, job } = await suspendedWorld();
    await Company.updateOne({ _id: company._id }, { verification: "verified" });

    expect((await session.agent.get(`/api/employer/jobs/${job.id}/applications`)).status).toBe(200);
  });

  it("has its jobs hidden from the board, the job page, saved jobs and applying", async () => {
    const employer = await employerSession(app);
    const job = await createJob(employer.company._id, { title: "Hidden role" });
    const student = await studentSession(app);
    await student.session.put(`/api/jobs/${job.id}/save`).expect(204);
    await Company.updateOne({ _id: employer.company._id }, { verification: "suspended" });

    const board = await student.session.agent.get("/api/jobs");
    const page = await student.session.agent.get(`/api/jobs/${job.slug}`);
    const saved = await student.session.agent.get("/api/me/saved-jobs");
    const apply = await student.session.post(`/api/jobs/${job.id}/apply`).send({});

    expect((board.body as { total: number }).total).toBe(0);
    expect(page.status).toBe(404);
    expect((saved.body as { total: number }).total).toBe(0);
    expect(apply.status).toBe(404);
  });

  it("can still manage the account itself", async () => {
    const { session } = await suspendedWorld();

    expect((await session.agent.get("/api/auth/me")).status).toBe(200);
  });
});
