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

/** Marks open applications to the jobs `closed` and tells each applicant. */
async function closeApplications(
  mailer: Mailer,
  log: MailFailureLog,
  company: { name: string },
  jobs: { _id: mongoose.Types.ObjectId; title: string }[],
): Promise<void> {
  const jobIds = jobs.map((job) => job._id);
  const open = await Application.find({
    jobId: anyOf(jobIds),
    status: anyOf(OPEN_STATUSES),
  })
    .select("jobId studentId")
    .lean();
  // The jobs are going away, and so are their interview slots.
  await Application.updateMany({ jobId: anyOf(jobIds) }, { $unset: { interview: 1 } });
  if (open.length === 0) return;
  await Application.updateMany(
    { _id: anyOf(open.map((application) => application._id)) },
    { $set: { status: "closed" } },
  );

  const students = await User.find({ _id: anyOf(open.map((application) => application.studentId)) })
    .select("email")
    .lean();
  const emailOf = new Map(students.map((student) => [student._id.toString(), student.email]));
  const titleOf = new Map(jobs.map((job) => [job._id.toString(), job.title]));
  await Promise.all(
    open.flatMap((application) => {
      const to = emailOf.get(application.studentId.toString());
      const jobTitle = titleOf.get(application.jobId.toString());
      if (to === undefined || jobTitle === undefined) return [];
      const content = emails.applicationsClosed({ jobTitle, company: company.name });
      return [sendSafely(mailer, { to, ...content }, log, "applications_closed")];
    }),
  );
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
