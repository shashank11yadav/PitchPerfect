import type { Router } from "express";
import { describe, expect, it } from "vitest";
import { Application, PracticeAttempt } from "../src/db/models/index.js";
import { applicationRoutes } from "../src/modules/applications/routes.js";
import { jobRoutes } from "../src/modules/jobs/routes.js";
import { lessonRoutes } from "../src/modules/lessons/routes.js";
import { practiceRoutes } from "../src/modules/practice/routes.js";
import { profileRoutes } from "../src/modules/profile/routes.js";
import { createCoachProbe } from "../src/services/coach-probe.js";
import { makeTestApp } from "./helpers/app.js";
import { csrfAgent } from "./helpers/csrf.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import { createApplication, createAttempt, createJob } from "./helpers/factories.js";
import { call, employerSession, studentSession, type Method } from "./helpers/sessions.js";

useTestDb();

const { app, config, coach, mailer } = makeTestApp();

interface RouteCase {
  method: Method;
  /** Express path as registered, under `/api`. `:id` is the owner's attempt or application. */
  path: string;
  body?: object;
}

const key = ({ method, path }: RouteCase) => `${method.toUpperCase()} ${path}`;

/** Every route only a student may call. The table test fails if a router has one not listed. */
const STUDENT_ROUTES: RouteCase[] = [
  { method: "get", path: "/practice/quota" },
  { method: "post", path: "/practice/sessions", body: { skill: "pitching" } },
  { method: "get", path: "/practice/sessions/:id" },
  { method: "post", path: "/practice/sessions/:id/turns", body: { text: "Hi" } },
  { method: "post", path: "/practice/sessions/:id/end" },
  { method: "get", path: "/practice/attempts" },
  { method: "delete", path: "/practice/attempts/:id" },
  { method: "post", path: "/jobs/:id/apply", body: {} },
  { method: "get", path: "/me/applications" },
  { method: "post", path: "/applications/:id/withdraw" },
  { method: "put", path: "/applications/:id/scorecard", body: { attemptId: null } },
  { method: "put", path: "/jobs/:id/save" },
  { method: "delete", path: "/jobs/:id/save" },
  { method: "get", path: "/me/saved-jobs" },
  { method: "get", path: "/me/lessons" },
  { method: "put", path: "/me/lessons/:skill", body: { completed: true } },
  { method: "put", path: "/me/resume" },
  { method: "get", path: "/me/resume" },
  { method: "delete", path: "/me/resume" },
  { method: "post", path: "/me/practice-consent", body: { accepted: true } },
];

/** Routes for any signed-in account, whatever its role. */
const ACCOUNT_ROUTES: RouteCase[] = [
  { method: "patch", path: "/me/profile", body: {} },
  { method: "post", path: "/me/change-email", body: {} },
  { method: "post", path: "/me/change-password", body: {} },
  { method: "delete", path: "/me", body: {} },
  { method: "post", path: "/auth/resend-verification" },
  { method: "get", path: "/auth/me" },
];

/** The public job board. */
const PUBLIC_ROUTES = ["GET /jobs", "GET /jobs/:slug"];

/** Routes whose id belongs to one student: anyone else gets the same answer as an unknown id. */
const OWNED_ROUTES = STUDENT_ROUTES.filter(
  ({ path }) => path.startsWith("/practice/") && path.includes(":id"),
).concat(STUDENT_ROUTES.filter(({ path }) => path.startsWith("/applications/")));

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: unknown };
}

/**
 * The routes a router registers. A nested router (`router.use(sub)`) would hide its routes from
 * this list, so finding one fails loudly instead of letting the table miss them.
 */
function registered(router: Router, prefix = ""): string[] {
  const layers = router.stack as Layer[];
  return layers.flatMap(({ route, handle }) => {
    if (!route && Array.isArray(handle?.stack)) {
      throw new Error(`A nested router under "${prefix || "/"}" needs listing here by hand.`);
    }
    return route
      ? Object.keys(route.methods).map((method) => `${method.toUpperCase()} ${prefix}${route.path}`)
      : [];
  });
}

async function world() {
  const employer = await employerSession(app);
  const job = await createJob(employer.company._id);
  const owner = await studentSession(app);
  const attempt = await createAttempt(owner.user._id, { status: "active" });
  const application = await createApplication({
    jobId: job._id,
    studentId: owner.user._id,
    status: "applied",
  });
  return { employer, owner, job, attempt, application };
}

/** `route.path` with its ids filled in: the job for job routes, else the attempt or application. */
function url(route: RouteCase, ids: { job: string; attempt: string; application: string }) {
  const id = route.path.startsWith("/jobs/")
    ? ids.job
    : route.path.startsWith("/applications/")
      ? ids.application
      : ids.attempt;
  return `/api${route.path.replace(":id", id).replace(":skill", "pitching")}`;
}

describe("student route table", () => {
  it("lists every route of the student-facing routers as student-only, account, or public", () => {
    const routes = [
      ...registered(
        practiceRoutes({ config, coach, coachProbe: createCoachProbe(coach) }),
        "/practice",
      ),
      ...registered(applicationRoutes()),
      ...registered(jobRoutes()),
      ...registered(lessonRoutes()),
      ...registered(profileRoutes({ config, mailer })),
    ].sort();
    const accountRoutes = ACCOUNT_ROUTES.map(key).filter((route) => !route.includes("/auth/"));
    expect([...STUDENT_ROUTES.map(key), ...accountRoutes, ...PUBLIC_ROUTES].sort()).toEqual(routes);
  });
});

describe("access without a student session", () => {
  it("answers 401 signed out and 403 for employers on every student route", async () => {
    const { employer, job, attempt, application } = await world();
    const anonymous = await csrfAgent(app);
    const ids = { job: job.id, attempt: attempt.id, application: application.id };

    for (const route of STUDENT_ROUTES) {
      const target = url(route, ids);
      const signedOut = await call(anonymous, route.method, target, route.body);
      expect(signedOut.status, key(route)).toBe(401);
      expect(errorOf(signedOut).code, key(route)).toBe("unauthenticated");
      const asEmployer = await call(employer.session, route.method, target, route.body);
      expect(asEmployer.status, key(route)).toBe(403);
      expect(errorOf(asEmployer).code, key(route)).toBe("forbidden");
    }
    // Nothing was applied for, withdrawn, or deleted along the way.
    expect(await Application.countDocuments()).toBe(1);
    expect(await Application.findById(application._id)).toMatchObject({ status: "applied" });
    expect(await PracticeAttempt.findById(attempt._id)).toMatchObject({ status: "active" });
  });

  it("answers 401 signed out on every account route", async () => {
    const anonymous = await csrfAgent(app);
    for (const route of ACCOUNT_ROUTES) {
      const res = await call(anonymous, route.method, `/api${route.path}`, route.body);
      expect(res.status, key(route)).toBe(401);
      expect(errorOf(res).code, key(route)).toBe("unauthenticated");
    }
  });
});

describe("another student's attempts and applications", () => {
  it("answers 404 not_found on every owned route and changes nothing", async () => {
    const { owner, job, attempt, application } = await world();
    const intruder = await studentSession(app);
    const ids = { job: job.id, attempt: attempt.id, application: application.id };

    // A control: the same URLs work for their owner, so the 404s below are about ownership.
    const ownRead = await call(owner.session, "get", `/api/practice/sessions/${attempt.id}`);
    expect(ownRead.status).toBe(200);
    const ownList = await call(owner.session, "get", "/api/me/applications");
    expect(ownList.status).toBe(200);
    expect((ownList.body as { items: { id: string }[] }).items.map((item) => item.id)).toContain(
      application.id,
    );

    expect(OWNED_ROUTES.map(key)).toEqual([
      "GET /practice/sessions/:id",
      "POST /practice/sessions/:id/turns",
      "POST /practice/sessions/:id/end",
      "DELETE /practice/attempts/:id",
      "POST /applications/:id/withdraw",
      "PUT /applications/:id/scorecard",
    ]);
    for (const route of OWNED_ROUTES) {
      const res = await call(intruder.session, route.method, url(route, ids), route.body);
      expect(res.status, key(route)).toBe(404);
      expect(errorOf(res).code, key(route)).toBe("not_found");
    }

    expect(await PracticeAttempt.findById(attempt._id)).toMatchObject({ status: "active" });
    expect(await Application.findById(application._id)).toMatchObject({ status: "applied" });
  });
});
