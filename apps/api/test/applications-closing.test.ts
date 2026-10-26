import { afterEach, describe, expect, it, vi } from "vitest";
import { Application } from "../src/db/models/index.js";
import { closeOpenApplications } from "../src/modules/applications/closing.js";
import { useTestDb } from "./helpers/db.js";
import { FakeMailer } from "./helpers/fake-mailer.js";
import {
  createApplication,
  createEmployer,
  createJob,
  createStudent,
} from "./helpers/factories.js";

useTestDb();

afterEach(() => {
  vi.restoreAllMocks();
});

const log = { error: () => undefined };
const APP = { APP_URL: "https://app.example.test" };

describe("closeOpenApplications", () => {
  it("emails only the students whose applications this run closed", async () => {
    const mailer = new FakeMailer();
    const { company } = await createEmployer();
    const job = await createJob(company._id, { title: "Field rep" });
    const kept = await createStudent();
    const raced = await createStudent();
    await createApplication({ jobId: job._id, studentId: kept.user._id });
    const withdrawing = await createApplication({ jobId: job._id, studentId: raced.user._id });

    // The student withdraws after the open rows were read but before the bulk update runs.
    const original = Application.updateMany.bind(Application);
    vi.spyOn(Application, "updateMany").mockImplementation(((
      ...args: Parameters<typeof original>
    ) =>
      Application.collection
        .updateOne({ _id: withdrawing._id }, { $set: { status: "withdrawn" } })
        .then(() => original(...args))) as typeof original);

    await closeOpenApplications({ mailer, config: APP }, log, company, [job], "job_archived");

    expect(mailer.sent.map((message) => message.to)).toEqual([kept.email]);
    expect(mailer.sent[0]?.text).toContain("Browse open roles: https://app.example.test/jobs");
    expect((await Application.findById(withdrawing._id))?.status).toBe("withdrawn");
  });

  it("does nothing when nothing is open", async () => {
    const mailer = new FakeMailer();
    const { company } = await createEmployer();
    const job = await createJob(company._id);
    const student = await createStudent();
    await createApplication({ jobId: job._id, studentId: student.user._id, status: "hired" });

    await closeOpenApplications({ mailer, config: APP }, log, company, [job], "job_archived");

    expect(mailer.sent).toHaveLength(0);
  });
});
