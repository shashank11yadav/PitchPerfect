import mongoose from "mongoose";
import {
  APPLICATION_STATUSES,
  canTransition,
  type ApplicationClosedReason,
} from "@pitchperfect/shared";
import { Application, User } from "../../db/models/index.js";
import * as emails from "../../services/email-templates.js";
import { sendSafely, type MailFailureLog, type Mailer } from "../../services/mailer.js";
import { transitionApplication } from "./transitions.js";

/** A job whose applications are being closed. */
export interface ClosingJob {
  _id: mongoose.Types.ObjectId;
  title: string;
}

/** `sanitizeFilter` strips operators from filters unless they are marked as ours. */
export const anyOf = <T>(values: T[]) => mongoose.trusted({ $in: values });

/** The statuses the system may close, i.e. the open ones; the shared transition table is the one source. */
export const OPEN_STATUSES = APPLICATION_STATUSES.filter((status) =>
  canTransition(status, "closed", "system"),
);

/**
 * Gives every application to these jobs (any status) the job title and company name, so it can
 * still be shown once the job is gone. Applications made after snapshots existed already have one.
 */
async function snapshotJobs(company: { name: string }, jobs: ClosingJob[]): Promise<void> {
  if (jobs.length === 0) return;
  await Application.bulkWrite(
    jobs.map((job) => ({
      updateMany: {
        filter: { jobId: job._id, jobSnapshot: null },
        update: { $set: { jobSnapshot: { title: job.title, companyName: company.name } } },
      },
    })),
  );
}

/** One email per student, naming every one of their jobs that closed (in the order they applied). */
async function notifyApplicants(
  mailer: Mailer,
  log: MailFailureLog,
  company: { name: string },
  jobs: ClosingJob[],
  closed: { jobId: mongoose.Types.ObjectId; studentId: mongoose.Types.ObjectId }[],
): Promise<void> {
  const students = await User.find({
    _id: anyOf(closed.map((application) => application.studentId)),
  })
    .select("email")
    .lean();
  const emailOf = new Map(students.map((student) => [student._id.toString(), student.email]));
  const titleOf = new Map(jobs.map((job) => [job._id.toString(), job.title]));
  const titlesByStudent = new Map<string, string[]>();
  for (const { jobId, studentId } of closed) {
    const title = titleOf.get(jobId.toString());
    if (title === undefined) continue;
    titlesByStudent.set(studentId.toString(), [
      ...(titlesByStudent.get(studentId.toString()) ?? []),
      title,
    ]);
  }
  await Promise.all(
    [...titlesByStudent].flatMap(([studentId, jobTitles]) => {
      const to = emailOf.get(studentId);
      if (to === undefined) return [];
      const content = emails.applicationsClosed({ jobTitles, company: company.name });
      return [sendSafely(mailer, { to, ...content }, log, "applications_closed")];
    }),
  );
}

/**
 * Closes the open applications to these jobs with `reason`, drops their interview slots, and
 * tells each affected student once. Snapshots are written first, so nothing is left without a
 * title. Safe to repeat: a second run finds nothing open and sends nothing.
 */
export async function closeOpenApplications(
  mailer: Mailer,
  log: MailFailureLog,
  company: { name: string },
  jobs: ClosingJob[],
  reason: ApplicationClosedReason,
): Promise<void> {
  await snapshotJobs(company, jobs);
  const open = await Application.find({
    jobId: anyOf(jobs.map((job) => job._id)),
    status: anyOf(OPEN_STATUSES),
  })
    .select("jobId studentId status")
    .sort({ createdAt: 1 })
    .lean();
  if (open.length === 0) return;
  for (const application of open) transitionApplication(application, "closed", "system");
  const targeted = anyOf(open.map((application) => application._id));
  await Application.updateMany(
    // Guarded on status, so an application decided in the meantime isn't closed over the decision.
    { _id: targeted, status: anyOf(OPEN_STATUSES) },
    {
      $set: { status: "closed", closedReason: reason, endedAt: new Date() },
      $unset: { interview: 1 },
    },
  );
  // Only the rows this run actually closed: anything decided in the meantime keeps its status.
  const closed = await Application.find({ _id: targeted, status: "closed", closedReason: reason })
    .select("jobId studentId")
    .sort({ createdAt: 1 })
    .lean();
  await notifyApplicants(mailer, log, company, jobs, closed);
}
