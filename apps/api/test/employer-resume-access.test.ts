import mongoose from "mongoose";
import type request from "supertest";
import { describe, expect, it } from "vitest";
import { DAY_MS, LIMITS, type EmployerApplicationView, type Page } from "@pitchperfect/shared";
import { Application } from "../src/db/models/index.js";
import { makeTestApp } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import { createApplication, createJob } from "./helpers/factories.js";
import { pdfOfSize } from "./helpers/pdf.js";
import { employerSession, studentSession } from "./helpers/sessions.js";

useTestDb();

const { app } = makeTestApp();

const GRACE_MS = LIMITS.resumeAccessGraceDays * DAY_MS;

const binary = (res: request.Response, done: (error: Error | null, body: Buffer) => void): void => {
  const parts: Buffer[] = [];
  res.on("data", (part: Buffer) => parts.push(part));
  res.on("end", () => {
    done(null, Buffer.concat(parts));
  });
};

/** A student who uploaded `resume` and applied to an active job of a verified employer. */
async function applied(resume = pdfOfSize(1000)) {
  const employer = await employerSession(app);
  const job = await createJob(employer.company._id, { title: "Field rep" });
  const student = await studentSession(app);
  await student.session.put("/api/me/resume").attach("file", resume, "cv.pdf").expect(200);
  await student.session.post(`/api/jobs/${job.id}/apply`).send({}).expect(201);
  const application = await Application.findOne({ jobId: job._id }).orFail().lean();
  const path = `/api/employer/applications/${application._id.toString()}/resume`;
  const download = () => employer.session.agent.get(path).buffer(true).parse(binary);
  /** The same request with the JSON error body parsed, for refusals. */
  const refused = () => employer.session.agent.get(path);
  const listed = async () => {
    const res = await employer.session.agent.get(`/api/employer/jobs/${job.id}/applications`);
    return (res.body as Page<EmployerApplicationView>).items[0];
  };
  return { employer, job, student, application, download, refused, listed };
}

/** How many résumé files GridFS holds. */
const residentFiles = () => mongoose.connection.collection("resumes.files").countDocuments();

/** Moves the application to `status` as if that happened `ago` ms ago. */
async function endedAgo(applicationId: unknown, status: string, ago: number) {
  const at = new Date(Date.now() - ago);
  await Application.updateOne(
    { _id: applicationId },
    { $set: { status, endedAt: at, updatedAt: at } },
    { timestamps: false },
  );
}

describe("résumé access", () => {
  it("serves the résumé the student applied with, not a later upload", async () => {
    const first = pdfOfSize(1000);
    const { student, download } = await applied(first);
    await student.session.put("/api/me/resume").attach("file", pdfOfSize(3000), "new.pdf");

    const res = await download();

    expect(res.status).toBe(200);
    expect((res.body as Buffer).equals(first)).toBe(true);
  });

  it("takes the copy back too when the student deletes their résumé", async () => {
    const { student, application, download, listed } = await applied();
    await student.session.delete("/api/me/resume").expect(204);

    expect((await listed())?.hasResume).toBe(false);
    expect((await download()).status).toBe(404);
    expect((await Application.findById(application._id).lean())?.resumeFileId).toBeNull();
    expect(await residentFiles()).toBe(0);
  });

  it("applies without a résumé when the student has none, and never picks up a later upload", async () => {
    const employer = await employerSession(app);
    const job = await createJob(employer.company._id);
    const student = await studentSession(app);
    await student.session.post(`/api/jobs/${job.id}/apply`).send({}).expect(201);
    await student.session.put("/api/me/resume").attach("file", pdfOfSize(900), "cv.pdf");
    const application = await Application.findOne({ jobId: job._id }).orFail().lean();

    const res = await employer.session.agent.get(
      `/api/employer/applications/${application._id.toString()}/resume`,
    );

    expect(application.resumeFileId).toBeNull();
    expect(res.status).toBe(404);
  });

  it("deletes the copies with the student's account", async () => {
    const { student } = await applied();

    await student.session.delete("/api/me").send({ currentPassword: student.password }).expect(204);

    expect(await residentFiles()).toBe(0);
  });

  it("makes no copy when the student applies twice", async () => {
    const { student, job } = await applied();

    await student.session.post(`/api/jobs/${job.id}/apply`).send({}).expect(409);

    // The profile's file and the one application's copy.
    expect(await residentFiles()).toBe(2);
  });

  it.each(["applied", "shortlisted", "interview"] as const)(
    "is open while the application is %s on an active job",
    async (status) => {
      const { application, download, listed } = await applied();
      await Application.updateOne({ _id: application._id }, { $set: { status } });

      expect((await download()).status).toBe(200);
      expect((await listed())?.hasResume).toBe(true);
    },
  );

  it.each(["rejected", "hired", "closed"] as const)(
    "stays open for the grace period after the application is %s",
    async (status) => {
      const { application, download, listed } = await applied();
      await endedAgo(application._id, status, GRACE_MS - DAY_MS);

      expect((await download()).status).toBe(200);
      expect((await listed())?.hasResume).toBe(true);
    },
  );

  it.each(["rejected", "hired", "closed"] as const)(
    "ends once the grace period after %s has passed",
    async (status) => {
      const { application, refused, listed } = await applied();
      await endedAgo(application._id, status, GRACE_MS + 60_000);

      const res = await refused();

      expect(res.status).toBe(404);
      expect(errorOf(res).code).toBe("not_found");
      expect((await listed())?.hasResume).toBe(false);
    },
  );

  it("ends at once when the student withdraws, and the copy is removed", async () => {
    const { student, application, download, listed } = await applied();
    await student.session.post(`/api/applications/${application._id.toString()}/withdraw`);

    expect((await download()).status).toBe(404);
    expect((await listed())?.hasResume).toBe(false);
    expect((await Application.findById(application._id).lean())?.resumeFileId).toBeNull();
    // Only the profile's file is left.
    expect(await residentFiles()).toBe(1);
  });

  it("records when the employer's decision ended the application", async () => {
    const { employer, application } = await applied();
    const before = Date.now();

    await employer.session
      .patch(`/api/employer/applications/${application._id.toString()}`)
      .send({ status: "rejected" })
      .expect(200);

    const stored = await Application.findById(application._id).lean();
    expect(stored?.endedAt?.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("records when archiving the job closed the application", async () => {
    const { employer, job, application, download } = await applied();
    const before = Date.now();

    await employer.session
      .post(`/api/employer/jobs/${job.id}/status`)
      .send({ status: "archived" })
      .expect(200);

    const stored = await Application.findById(application._id).lean();
    expect(stored).toMatchObject({ status: "closed" });
    expect(stored?.endedAt?.getTime()).toBeGreaterThanOrEqual(before);
    expect((await download()).status).toBe(200);
  });

  it("falls back to the profile résumé for an application made before snapshots", async () => {
    const employer = await employerSession(app);
    const job = await createJob(employer.company._id);
    const student = await studentSession(app);
    const resume = pdfOfSize(1500);
    await student.session.put("/api/me/resume").attach("file", resume, "cv.pdf").expect(200);
    const application = await createApplication({ jobId: job._id, studentId: student.user._id });

    const res = await employer.session.agent
      .get(`/api/employer/applications/${application.id}/resume`)
      .buffer(true)
      .parse(binary);

    expect(res.status).toBe(200);
    expect((res.body as Buffer).equals(resume)).toBe(true);
  });
});
