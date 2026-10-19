import mongoose from "mongoose";
import type { ApplicationStatus, Role } from "@pitchperfect/shared";
import {
  Application,
  AuthToken,
  Company,
  EmployerProfile,
  Job,
  PracticeAttempt,
  SavedJob,
  StudentProfile,
  User,
} from "../../db/models/index.js";
import * as emails from "../../services/email-templates.js";
import { deleteResume } from "../../services/files.js";
import { sendSafely, type MailFailureLog, type Mailer } from "../../services/mailer.js";

const OPEN_STATUSES: ApplicationStatus[] = ["applied", "shortlisted", "interview"];

/** `sanitizeFilter` strips operators from filters unless they are marked as ours. */
const anyOf = <T>(values: T[]) => mongoose.trusted({ $in: values });

async function deleteStudentData(userId: string): Promise<void> {
  const profile = await StudentProfile.findOne({ userId }).select("resumeFileId").lean();
  if (profile?.resumeFileId) await deleteResume(profile.resumeFileId);
  await Promise.all([
    PracticeAttempt.deleteMany({ studentId: userId }),
    Application.deleteMany({ studentId: userId }),
    SavedJob.deleteMany({ studentId: userId }),
  ]);
  await StudentProfile.deleteOne({ userId });
}

interface DeletedJob {
  _id: mongoose.Types.ObjectId;
  title: string;
}

/**
 * Gives every application to these jobs (any status) the job title and company name, so it can
 * still be shown once the job is gone. Applications made after snapshots existed already have one.
 */
async function snapshotJobs(company: { name: string }, jobs: DeletedJob[]): Promise<void> {
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
  jobs: DeletedJob[],
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
 * Closes open applications to the jobs (reason `employer_left`), drops interviews, and tells each
 * affected student once. Snapshots are written first, so nothing is left without a title.
 */
async function closeApplications(
  mailer: Mailer,
  log: MailFailureLog,
  company: { name: string },
  jobs: DeletedJob[],
): Promise<void> {
  const jobIds = jobs.map((job) => job._id);
  await snapshotJobs(company, jobs);
  const open = await Application.find({ jobId: anyOf(jobIds), status: anyOf(OPEN_STATUSES) })
    .select("jobId studentId")
    .sort({ createdAt: 1 })
    .lean();
  // The jobs are going away, and so are their interview slots.
  await Application.updateMany({ jobId: anyOf(jobIds) }, { $unset: { interview: 1 } });
  if (open.length === 0) return;
  await Application.updateMany(
    { _id: anyOf(open.map((application) => application._id)) },
    { $set: { status: "closed", closedReason: "employer_left" } },
  );
  await notifyApplicants(mailer, log, company, jobs, open);
}

async function deleteEmployerData(mailer: Mailer, log: MailFailureLog, userId: string) {
  const company = await Company.findOne({ ownerId: userId }).select("name").lean();
  if (company) {
    const jobs = await Job.find({ companyId: company._id }).select("title").lean();
    const jobIds = jobs.map((job) => job._id);
    await closeApplications(mailer, log, company, jobs);
    await Promise.all([
      SavedJob.deleteMany({ jobId: anyOf(jobIds) }),
      PracticeAttempt.updateMany({ jobId: anyOf(jobIds) }, { $unset: { jobId: 1 } }),
    ]);
    await Job.deleteMany({ companyId: company._id });
    await Company.deleteOne({ _id: company._id });
  }
  await EmployerProfile.deleteOne({ userId });
}

/**
 * Deletes the account and everything it owns (design §6.3). The user document goes last, so a
 * failure part-way leaves an account that can simply try again; the steps are safe to repeat.
 * Sessions need no sweep: they are rejected as soon as their user no longer exists.
 */
export async function deleteAccount(
  mailer: Mailer,
  log: MailFailureLog,
  user: { id: string; role: Role },
): Promise<void> {
  if (user.role === "student") await deleteStudentData(user.id);
  else await deleteEmployerData(mailer, log, user.id);
  await AuthToken.deleteMany({ userId: user.id });
  await User.deleteOne({ _id: user.id });
}
