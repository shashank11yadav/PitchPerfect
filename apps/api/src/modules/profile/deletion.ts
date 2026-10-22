import type { Role } from "@pitchperfect/shared";
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
import { deleteResume } from "../../services/files.js";
import type { MailFailureLog, Mailer } from "../../services/mailer.js";
import { anyOf, closeOpenApplications, type ClosingJob } from "../applications/closing.js";

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

/** Closes open applications (reason `employer_left`) and drops every interview slot: the jobs are going away. */
async function closeApplications(
  mailer: Mailer,
  log: MailFailureLog,
  company: { name: string },
  jobs: ClosingJob[],
): Promise<void> {
  await Application.updateMany(
    { jobId: anyOf(jobs.map((job) => job._id)) },
    { $unset: { interview: 1 } },
  );
  await closeOpenApplications(mailer, log, company, jobs, "employer_left");
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
 * Deletes the account and everything it owns (design §6.2). The user document goes last, so a
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
