import type { Router } from "express";
import { describe, expect, it } from "vitest";
import { Application, Job } from "../src/db/models/index.js";
import { employerRoutes } from "../src/modules/employer/routes.js";
import { makeTestApp } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import { createApplication, createAttempt, createJob } from "./helpers/factories.js";
import { csrfAgent } from "./helpers/csrf.js";
import { call, employerSession, studentSession, type Method } from "./helpers/sessions.js";

useTestDb();

const { app, mailer } = makeTestApp();

interface RouteCase {
  method: Method;
  /** Express path as registered, relative to `/api/employer`. */
  path: string;
  body?: object;
}

const INTERVIEW = { startsAt: "2099-01-01T10:00:00Z", meetingUrl: "https://meet.example/a" };

/** Every route that takes an id. The test below fails if the router has one that isn't listed. */
const ID_ROUTES: RouteCase[] = [
  { method: "get", path: "/jobs/:id" },
  { method: "patch", path: "/jobs/:id", body: { title: "Hijacked" } },
  { method: "post", path: "/jobs/:id/status", body: { status: "archived" } },
  { method: "delete", path: "/jobs/:id" },
  { method: "get", path: "/jobs/:id/applications" },
  { method: "patch", path: "/applications/:id", body: { status: "shortlisted" } },
  { method: "put", path: "/applications/:id/save" },
  { method: "delete", path: "/applications/:id/save" },
  { method: "post", path: "/applications/:id/interview", body: INTERVIEW },
  { method: "get", path: "/applications/:id/resume" },
  { method: "get", path: "/applications/:id/scorecard" },
];

function registered(router: Router): string[] {
  const layers = router.stack as { route?: { path: string; methods: Record<string, boolean> } }[];
  return layers.flatMap(({ route }) =>
    route
      ? Object.keys(route.methods).map((method) => `${method.toUpperCase()} ${route.path}`)
      : [],
  );
}

const key = ({ method, path }: RouteCase) => `${method.toUpperCase()} ${path}`;

async function world() {
  const owner = await employerSession(app);
  const intruder = await employerSession(app);
  const job = await createJob(owner.company._id);
  const student = await studentSession(app);
  const attempt = await createAttempt(student.user._id);
  const application = await createApplication({
    jobId: job._id,
    studentId: student.user._id,
    status: "shortlisted",
    sharedAttemptId: attempt._id,
  });
  return { owner, intruder, job, application };
}

const url = (route: RouteCase, ids: { job: string; application: string }) =>
  `/api/employer${route.path.replace(":id", route.path.startsWith("/jobs") ? ids.job : ids.application)}`;

describe("employer route table", () => {
  it("covers every employer route that takes an id", () => {
    const routes = registered(employerRoutes({ mailer }));
    const withId = routes.filter((route) => route.includes(":id")).sort();
    expect(ID_ROUTES.map(key).sort()).toEqual(withId);
  });
});

describe("another employer's jobs and applications", () => {
  it("answers 404 not_found on every id route and changes nothing", async () => {
    const { intruder, job, application } = await world();
    const ids = { job: job.id, application: application.id };

    for (const route of ID_ROUTES) {
      const res = await call(intruder.session, route.method, url(route, ids), route.body);
      expect(res.status, key(route)).toBe(404);
      expect(errorOf(res).code, key(route)).toBe("not_found");
    }

    expect((await Job.findById(job._id))?.toObject()).toMatchObject({
      title: "Sales development rep",
      status: "active",
    });
    expect(await Application.findById(application._id)).toMatchObject({
      status: "shortlisted",
      savedByEmployer: false,
    });
    expect(mailer.sent).toHaveLength(0);
  });

  it("does not list another company's jobs or applicants", async () => {
    const { intruder } = await world();
    const jobs = await intruder.session.agent.get("/api/employer/jobs");
    expect((jobs.body as { total: number }).total).toBe(0);
  });

  it("does not reveal whether an id exists: unknown and foreign ids look the same", async () => {
    const { intruder, job } = await world();
    const foreign = await intruder.session.agent.get(`/api/employer/jobs/${job.id}`);
    const unknown = await intruder.session.agent.get("/api/employer/jobs/507f1f77bcf86cd799439011");
    expect(foreign.status).toBe(unknown.status);
    expect(errorOf(foreign).message).toBe(errorOf(unknown).message);
  });
});

describe("access without an employer session", () => {
  it("answers 401 signed out and 403 for students on every route", async () => {
    const { job, application } = await world();
    const student = await studentSession(app);
    const anonymous = await csrfAgent(app);
    const ids = { job: job.id, application: application.id };
    const routes: RouteCase[] = [
      ...ID_ROUTES,
      { method: "get", path: "/company" },
      { method: "patch", path: "/company", body: {} },
      { method: "get", path: "/dashboard" },
      { method: "get", path: "/jobs" },
      { method: "post", path: "/jobs", body: {} },
    ];

    for (const route of routes) {
      const target = url(route, ids);
      const signedOut = await call(anonymous, route.method, target, route.body);
      expect(signedOut.status, key(route)).toBe(401);
      const asStudent = await call(student.session, route.method, target, route.body);
      expect(asStudent.status, key(route)).toBe(403);
    }
    expect(await Application.countDocuments({ status: "shortlisted" })).toBe(1);
  });
});
