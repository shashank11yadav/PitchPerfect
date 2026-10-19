import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import type { EmployerJob, EmployerJobSummary, Page } from "@pitchperfect/shared";
import { Application, Job, SavedJob } from "../src/db/models/index.js";
import { makeTestApp } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import { createApplication, createJob, createStudent } from "./helpers/factories.js";
import { employerSession, studentSession } from "./helpers/sessions.js";

useTestDb();

const { app, mailer } = makeTestApp();

afterEach(() => {
  mailer.sent.length = 0;
});

const jobOf = (res: { body: unknown }) => (res.body as { job: EmployerJob }).job;
const pageOf = (res: { body: unknown }) => res.body as Page<EmployerJobSummary>;

const validJob = {
  title: "Sales development rep",
  location: "Boston, MA",
  workplace: "hybrid",
  employmentType: "full_time",
  descriptionHtml: "<p>Call <strong>prospects</strong>.</p>",
  skills: ["cold calling", "crm"],
  pay: {
    type: "range",
    min: 20,
    max: 30,
    currency: "USD",
    frequency: "hourly",
    commission: true,
  },
} as const;

describe("POST /api/employer/jobs", () => {
  it("creates a draft when status is omitted", async () => {
    const { session, company } = await employerSession(app);

    const res = await session.post("/api/employer/jobs").send(validJob);

    expect(res.status).toBe(201);
    expect(jobOf(res)).toMatchObject({
      title: "Sales development rep",
      status: "draft",
      publishedAt: null,
      applicantCount: 0,
      skills: ["cold calling", "crm"],
    });
    const stored = await Job.findById(jobOf(res).id);
    expect(stored?.companyId.toString()).toBe(company.id);
    expect(stored?.publishedAt).toBeUndefined();
    expect(jobOf(res).slug).toMatch(/^sales-development-rep-[a-z0-9]{6}$/);
  });

  it("publishes immediately when status is active, and the public board shows it", async () => {
    const { session } = await employerSession(app);

    const res = await session.post("/api/employer/jobs").send({ ...validJob, status: "active" });

    expect(res.status).toBe(201);
    expect(jobOf(res).status).toBe("active");
    expect(jobOf(res).publishedAt).toEqual(expect.any(String));
    const listed = await request(app).get(`/api/jobs/${jobOf(res).slug}`);
    expect(listed.status).toBe(200);
  });

  it("sanitizes the description on the server", async () => {
    const { session } = await employerSession(app);

    const res = await session.post("/api/employer/jobs").send({
      ...validJob,
      descriptionHtml:
        '<p onclick="x()">Hi</p><script>alert(1)</script><a href="javascript:alert(1)">bad</a><a href="https://ok.example">ok</a>',
    });

    const html = jobOf(res).descriptionHtml;
    expect(html).toContain("<p>Hi</p>");
    expect(html).not.toMatch(/script|onclick|javascript:/i);
    expect(html).toContain('href="https://ok.example"');
  });

  it("rejects a description that is empty once sanitized", async () => {
    const { session } = await employerSession(app);

    const res = await session
      .post("/api/employer/jobs")
      .send({ ...validJob, descriptionHtml: "<script>alert(1)</script>" });

    expect(res.status).toBe(400);
    expect(errorOf(res).fields).toHaveProperty("descriptionHtml");
  });

  it("gives jobs with the same title different slugs", async () => {
    const { session } = await employerSession(app);

    const first = jobOf(await session.post("/api/employer/jobs").send(validJob));
    const second = jobOf(await session.post("/api/employer/jobs").send(validJob));

    expect(first.slug).not.toBe(second.slug);
  });

  it("validates input and refuses fields that are not writable", async () => {
    const { session } = await employerSession(app);
    const post = (body: object) => session.post("/api/employer/jobs").send(body);

    expect((await post({ ...validJob, status: "archived" })).status).toBe(400);
    expect((await post({ ...validJob, companyId: "507f1f77bcf86cd799439011" })).status).toBe(400);
    expect((await post({ ...validJob, slug: "mine" })).status).toBe(400);
    expect((await post({ ...validJob, applicants: 5 })).status).toBe(400);
    expect(
      (
        await post({
          ...validJob,
          pay: {
            type: "range",
            min: 30,
            max: 20,
            currency: "USD",
            frequency: "hourly",
            commission: false,
          },
        })
      ).status,
    ).toBe(400);
    expect((await post({ ...validJob, title: "" })).status).toBe(400);
    expect(await Job.countDocuments()).toBe(0);
  });

  it("needs a verified email", async () => {
    const { session } = await employerSession(app, { verified: false });

    const res = await session.post("/api/employer/jobs").send(validJob);

    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("email_not_verified");
  });

  it("is for employers only", async () => {
    const { session } = await studentSession(app);
    expect((await session.post("/api/employer/jobs").send(validJob)).status).toBe(403);
  });
});

describe("GET /api/employer/jobs", () => {
  it("lists only the employer's own jobs with applicant counts, newest first", async () => {
    const mine = await employerSession(app);
    const other = await employerSession(app);
    const older = await createJob(mine.company._id, { title: "Older" });
    const newer = await createJob(mine.company._id, { title: "Newer", status: "draft" });
    await createJob(other.company._id, { title: "Not mine" });
    const student = await createStudent();
    await createApplication({ jobId: older._id, studentId: student.user._id });

    const res = await mine.session.agent.get("/api/employer/jobs");

    expect(res.status).toBe(200);
    expect(pageOf(res).total).toBe(2);
    expect(pageOf(res).items.map((job) => [job.title, job.applicantCount])).toEqual([
      ["Newer", 0],
      ["Older", 1],
    ]);
    expect(pageOf(res).items[0]?.id).toBe(newer.id);
  });

  it("filters by status and paginates", async () => {
    const { session, company } = await employerSession(app);
    await createJob(company._id, { title: "A", status: "draft" });
    await createJob(company._id, { title: "B" });
    await createJob(company._id, { title: "C" });

    const drafts = await session.agent.get("/api/employer/jobs?status=draft");
    const page = await session.agent.get("/api/employer/jobs?status=active&pageSize=1&page=2");

    expect(pageOf(drafts).items.map((job) => job.title)).toEqual(["A"]);
    expect(pageOf(page)).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(pageOf(page).items).toHaveLength(1);
    expect((await session.agent.get("/api/employer/jobs?status=nope")).status).toBe(400);
  });
});

describe("GET /api/employer/jobs/:id", () => {
  it("returns the full job to its owner, drafts included", async () => {
    const { session, company } = await employerSession(app);
    const job = await createJob(company._id, { status: "draft", skills: ["a"] });

    const res = await session.agent.get(`/api/employer/jobs/${job.id}`);

    expect(res.status).toBe(200);
    expect(jobOf(res)).toMatchObject({
      id: job.id,
      status: "draft",
      skills: ["a"],
      pay: { type: "unpaid" },
    });
    expect(jobOf(res).descriptionHtml).toContain("Fictional role");
  });

  it("answers 400 for a malformed id and 404 for an unknown one", async () => {
    const { session } = await employerSession(app);
    expect((await session.agent.get("/api/employer/jobs/nope")).status).toBe(400);
    const res = await session.agent.get("/api/employer/jobs/507f1f77bcf86cd799439011");
    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe("not_found");
  });
});

describe("PATCH /api/employer/jobs/:id", () => {
  it("edits fields, sanitizes the description, and keeps the slug", async () => {
    const { session, company } = await employerSession(app);
    const job = await createJob(company._id, { title: "Original" });

    const res = await session.patch(`/api/employer/jobs/${job.id}`).send({
      title: "Renamed",
      descriptionHtml: "<p>New</p><iframe src='https://evil.example'></iframe>",
      pay: { type: "unpaid" },
    });

    expect(res.status).toBe(200);
    expect(jobOf(res)).toMatchObject({
      title: "Renamed",
      slug: job.slug,
      descriptionHtml: "<p>New</p>",
      pay: { type: "unpaid" },
    });
  });

  it("clears stale pay fields when the pay type changes", async () => {
    const { session, company } = await employerSession(app);
    const job = await createJob(company._id, {
      pay: {
        type: "range",
        min: 1,
        max: 2,
        currency: "USD",
        frequency: "hourly",
        commission: false,
      },
    });

    await session
      .patch(`/api/employer/jobs/${job.id}`)
      .send({ pay: { type: "unpaid" } })
      .expect(200);

    const stored = await Job.findById(job._id).lean();
    expect(stored?.pay).toEqual({ type: "unpaid" });
  });

  it("refuses companyId, slug, status, and applicants", async () => {
    const { session, company } = await employerSession(app);
    const job = await createJob(company._id);

    for (const body of [
      { companyId: "507f1f77bcf86cd799439011" },
      { slug: "mine" },
      { status: "archived" },
      { applicants: 3 },
    ]) {
      const res = await session.patch(`/api/employer/jobs/${job.id}`).send(body);
      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe("validation_failed");
    }
    const stored = await Job.findById(job._id);
    expect(stored?.slug).toBe(job.slug);
    expect(stored?.companyId.toString()).toBe(company.id);
  });
});

describe("POST /api/employer/jobs/:id/status", () => {
  const setStatus = (
    session: Awaited<ReturnType<typeof employerSession>>["session"],
    id: string,
    status: string,
  ) => session.post(`/api/employer/jobs/${id}/status`).send({ status });

  it("publishes a draft and sets publishedAt only the first time", async () => {
    const { session, company } = await employerSession(app);
    const job = await createJob(company._id, { status: "draft", publishedAt: undefined });

    const published = await setStatus(session, job.id, "active");
    const firstPublishedAt = jobOf(published).publishedAt;
    await setStatus(session, job.id, "archived");
    const again = await setStatus(session, job.id, "active");

    expect(published.status).toBe(200);
    expect(jobOf(published).status).toBe("active");
    expect(firstPublishedAt).toEqual(expect.any(String));
    expect(jobOf(again)).toMatchObject({ status: "active", publishedAt: firstPublishedAt });
  });

  it("treats a stored null publishedAt as never published", async () => {
    const { session, company } = await employerSession(app);
    const job = await createJob(company._id, { status: "draft" });
    await Job.collection.updateOne({ _id: job._id }, { $set: { publishedAt: null } });

    const res = await setStatus(session, job.id, "active");

    expect(jobOf(res).publishedAt).toEqual(expect.any(String));
  });

  it("is idempotent for the current status", async () => {
    const { session, company } = await employerSession(app);
    const job = await createJob(company._id);
    const res = await setStatus(session, job.id, "active");
    expect(res.status).toBe(200);
  });

  it("does not allow going back to draft", async () => {
    const { session, company } = await employerSession(app);
    const job = await createJob(company._id);

    const res = await setStatus(session, job.id, "draft");

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe("invalid_transition");
  });

  it("rejects an unknown status", async () => {
    const { session, company } = await employerSession(app);
    const job = await createJob(company._id);
    expect((await setStatus(session, job.id, "closed")).status).toBe(400);
  });

  it("archiving closes open applications, emails each student once, and leaves others alone", async () => {
    const { session, company } = await employerSession(app, { companyName: "Applied Dynamics" });
    const job = await createJob(company._id, { title: "Field rep" });
    const students = await Promise.all([1, 2, 3, 4, 5, 6].map(() => createStudent()));
    const statuses = [
      "applied",
      "shortlisted",
      "interview",
      "hired",
      "rejected",
      "withdrawn",
    ] as const;
    await Promise.all(
      students.map((student, index) =>
        createApplication({
          jobId: job._id,
          studentId: student.user._id,
          status: statuses[index],
          ...(statuses[index] === "interview"
            ? {
                interview: {
                  startsAt: new Date(Date.now() + 86_400_000),
                  meetingUrl: "https://meet.example/x",
                },
              }
            : {}),
        }),
      ),
    );

    const res = await setStatus(session, job.id, "archived");

    expect(res.status).toBe(200);
    expect(jobOf(res).status).toBe("archived");
    const after = await Application.find({ jobId: job._id }).lean();
    const byStatus = Object.fromEntries(
      after.map((application) => [application.studentId.toString(), application]),
    );
    for (const [index, student] of students.entries()) {
      const application = byStatus[student.user.id];
      if (index < 3) {
        expect(application).toMatchObject({ status: "closed", closedReason: "job_archived" });
        expect(application?.interview).toBeUndefined();
      } else {
        expect(application?.status).toBe(statuses[index]);
        expect(application?.closedReason).toBeNull();
      }
    }
    expect(mailer.sent.map((message) => message.to).sort()).toEqual(
      students
        .slice(0, 3)
        .map((student) => student.email)
        .sort(),
    );
    expect(mailer.sent[0]?.subject).toContain("Field rep");
  });

  it("keeps closed applications closed when the job is reactivated", async () => {
    const { session, company } = await employerSession(app);
    const job = await createJob(company._id);
    const student = await createStudent();
    const application = await createApplication({ jobId: job._id, studentId: student.user._id });

    await setStatus(session, job.id, "archived");
    await setStatus(session, job.id, "active");

    expect((await Application.findById(application._id))?.status).toBe("closed");
    expect(mailer.sent).toHaveLength(1);
  });

  it("does not fail the request when an email cannot be sent", async () => {
    const { session, company } = await employerSession(app);
    const job = await createJob(company._id);
    const student = await createStudent();
    await createApplication({ jobId: job._id, studentId: student.user._id });
    mailer.failing = true;

    try {
      expect((await setStatus(session, job.id, "archived")).status).toBe(200);
    } finally {
      mailer.failing = false;
    }
    expect((await Application.findOne({ jobId: job._id }))?.status).toBe("closed");
  });
});

describe("DELETE /api/employer/jobs/:id", () => {
  it("deletes a draft", async () => {
    const { session, company } = await employerSession(app);
    const job = await createJob(company._id, { status: "draft" });

    const res = await session.delete(`/api/employer/jobs/${job.id}`);

    expect(res.status).toBe(204);
    expect(await Job.findById(job._id)).toBeNull();
  });

  it("deletes a listed job with no applications and removes students' saves of it", async () => {
    const { session, company } = await employerSession(app);
    const job = await createJob(company._id);
    const student = await createStudent();
    await SavedJob.create({ studentId: student.user._id, jobId: job._id });

    const res = await session.delete(`/api/employer/jobs/${job.id}`);

    expect(res.status).toBe(204);
    expect(await Job.findById(job._id)).toBeNull();
    expect(await SavedJob.countDocuments({ jobId: job._id })).toBe(0);
  });

  it("answers 409 conflict when the job has applications", async () => {
    const { session, company } = await employerSession(app);
    const job = await createJob(company._id);
    const student = await createStudent();
    await createApplication({ jobId: job._id, studentId: student.user._id });

    const res = await session.delete(`/api/employer/jobs/${job.id}`);

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe("conflict");
    expect(await Job.findById(job._id)).not.toBeNull();
  });
});
