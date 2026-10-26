import type { Role } from "@pitchperfect/shared";
import type { Config } from "../../config.js";
import {
  Application,
  AuthToken,
  Company,
  EmailChange,
  EmployerProfile,
  Job,
  PracticeAttempt,
  PracticeStart,
  SavedJob,
  StudentProfile,
  User,
} from "../../db/models/index.js";
import { deleteResume } from "../../services/files.js";
import type { LinkingMailer, MailFailureLog, Mailer } from "../../services/mailer.js";
import { anyOf, closeOpenApplications, type ClosingJob } from "../applications/closing.js";
import { removeResumeCopies } from "../applications/resume-copies.js";
import { holdLedger } from "../practice/ledger-hold.js";

interface DeletionDeps {
  config: Config;
  mailer: Mailer;
}

async function deleteStudentData(config: Config, userId: string): Promise<void> {
  // This month's practice count is held under a keyed hash of the email, so signing up again
  // with it doesn't give a fresh quota (docs/security.md).
  const user = await User.findById(userId).select("email").lean();
  if (user) await holdLedger(config, userId, user.email, new Date());
  const profile = await StudentProfile.findOne({ userId }).select("resumeFileId").lean();
  if (profile?.resumeFileId) await deleteResume(profile.resumeFileId);
  // Before the applications go, or their résumé copies would be left with nothing pointing at them.
  await removeResumeCopies({ studentId: userId });
  await Promise.all([
    PracticeAttempt.deleteMany({ studentId: userId }),
    // Earlier months of the ledger go too: they are never read again.
    PracticeStart.deleteMany({ studentId: userId }),
    Application.deleteMany({ studentId: userId }),
    SavedJob.deleteMany({ studentId: userId }),
  ]);
  await StudentProfile.deleteOne({ userId });
}

/** Closes open applications (reason `employer_left`) and drops every interview slot: the jobs are going away. */
async function closeApplications(
  mail: LinkingMailer,
  log: MailFailureLog,
  company: { name: string },
  jobs: ClosingJob[],
): Promise<void> {
  await Application.updateMany(
    { jobId: anyOf(jobs.map((job) => job._id)) },
    { $unset: { interview: 1 } },
  );
  await closeOpenApplications(mail, log, company, jobs, "employer_left");
}

async function deleteEmployerData(mail: LinkingMailer, log: MailFailureLog, userId: string) {
  const company = await Company.findOne({ ownerId: userId }).select("name").lean();
  if (company) {
    const jobs = await Job.find({ companyId: company._id }).select("title").lean();
    const jobIds = jobs.map((job) => job._id);
    await closeApplications(mail, log, company, jobs);
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
  { config, mailer }: DeletionDeps,
  log: MailFailureLog,
  user: { id: string; role: Role },
): Promise<void> {
  if (user.role === "student") await deleteStudentData(config, user.id);
  else await deleteEmployerData({ mailer, config }, log, user.id);
  await Promise.all([
    AuthToken.deleteMany({ userId: user.id }),
    EmailChange.deleteMany({ userId: user.id }),
  ]);
  await User.deleteOne({ _id: user.id });
}
