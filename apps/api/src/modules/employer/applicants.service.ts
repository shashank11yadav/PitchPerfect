import type {
  ApplicationStatus,
  EmployerApplicationListQuery,
  EmployerApplicationView,
  Interview,
  Page,
  SharedScorecardView,
} from "@pitchperfect/shared";
import { sharesScorecard, toEmployerApplicationView } from "../../db/mappers.js";
import { Application, PracticeAttempt, StudentProfile, User } from "../../db/models/index.js";
import { ConflictError, NotFoundError } from "../../errors.js";
import * as emails from "../../services/email-templates.js";
import { sendSafely, type MailFailureLog, type Mailer } from "../../services/mailer.js";
import { anyOf } from "../applications/closing.js";
import { completedAttemptIds } from "../applications/service.js";
import { transitionApplication } from "../applications/transitions.js";
import type { ApplicationDoc, CompanyDoc, JobDoc } from "./ownership.js";

/** Applications with their students' public details; any whose student is gone are left out. */
export async function applicantViews(
  applications: ApplicationDoc[],
): Promise<EmployerApplicationView[]> {
  const studentIds = anyOf(applications.map((application) => application.studentId));
  const [users, profiles, completed] = await Promise.all([
    User.find({ _id: studentIds }).select("name").lean(),
    StudentProfile.find({ userId: studentIds })
      .select("userId school major gradYear resumeFileId")
      .lean(),
    completedAttemptIds(applications),
  ]);
  const userOf = new Map(users.map((user) => [user._id.toString(), user]));
  const profileOf = new Map(profiles.map((profile) => [profile.userId.toString(), profile]));
  return applications.flatMap((application) => {
    const user = userOf.get(application.studentId.toString());
    const profile = profileOf.get(application.studentId.toString());
    return user && profile
      ? [
          toEmployerApplicationView(
            application,
            user,
            profile,
            sharesScorecard(application, completed),
          ),
        ]
      : [];
  });
}

async function viewOf(application: ApplicationDoc): Promise<EmployerApplicationView> {
  const [view] = await applicantViews([application]);
  if (!view) throw new NotFoundError();
  return view;
}

export async function listApplicants(
  job: JobDoc,
  { status, saved, page, pageSize }: EmployerApplicationListQuery,
): Promise<Page<EmployerApplicationView>> {
  const filter = {
    jobId: job._id,
    ...(status && { status }),
    ...(saved !== undefined && { savedByEmployer: saved }),
  };
  const [applications, total] = await Promise.all([
    Application.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Application.countDocuments(filter),
  ]);
  return { items: await applicantViews(applications), page, pageSize, total };
}

const changedMeanwhile = () =>
  new ConflictError("conflict", "That application just changed. Refresh and try again");

/** Moves the application through `transitionApplication`; the write is guarded on the status we checked. */
export async function setApplicationStatus(
  application: ApplicationDoc,
  to: ApplicationStatus,
): Promise<EmployerApplicationView> {
  const from = application.status;
  transitionApplication(application, to, "employer");
  const updated = await Application.findOneAndUpdate(
    { _id: application._id, status: from },
    // Only the interview endpoint sets `interview`, so any status set here ends the slot.
    { $set: { status: to }, $unset: { interview: 1 } },
    { returnDocument: "after" },
  ).lean();
  if (!updated) throw changedMeanwhile();
  return viewOf(updated);
}

/** A withdrawn application shares nothing: the student has pulled their résumé and scorecard back. */
export function assertNotWithdrawn(application: ApplicationDoc): void {
  if (application.status === "withdrawn") throw new NotFoundError();
}

/** A private bookmark: setting it again changes nothing, and the student's `updatedAt` stays put. */
export async function setSaved(application: ApplicationDoc, saved: boolean): Promise<void> {
  await Application.updateOne(
    { _id: application._id },
    { $set: { savedByEmployer: saved } },
    { timestamps: false },
  );
}

/** Schedules (or reschedules) the interview, moves the application to `interview`, and emails the student. */
export async function scheduleInterview(
  mailer: Mailer,
  log: MailFailureLog,
  company: CompanyDoc,
  { application, job }: { application: ApplicationDoc; job: JobDoc },
  { startsAt, meetingUrl }: Interview,
): Promise<EmployerApplicationView> {
  const from = application.status;
  transitionApplication(application, "interview", "employer");
  const startsAtUtc = new Date(startsAt);
  const updated = await Application.findOneAndUpdate(
    { _id: application._id, status: from },
    { $set: { status: "interview", interview: { startsAt: startsAtUtc, meetingUrl } } },
    { returnDocument: "after" },
  ).lean();
  if (!updated) throw changedMeanwhile();

  const student = await User.findById(updated.studentId).select("email").lean();
  if (student) {
    const content = emails.interviewScheduled({
      jobTitle: job.title,
      company: company.name,
      startsAtUtc,
      meetingUrl,
    });
    await sendSafely(mailer, { to: student.email, ...content }, log, "interview_scheduled");
  }
  return viewOf(updated);
}

/** The scorecard the student shared with this application, if it is still there and finished. */
export async function sharedScorecard(application: ApplicationDoc): Promise<SharedScorecardView> {
  const notShared = () => new NotFoundError("No scorecard has been shared", "not_shared");
  if (!application.sharedAttemptId) throw notShared();
  const attempt = await PracticeAttempt.findOne({
    _id: application.sharedAttemptId,
    studentId: application.studentId,
    status: "completed",
  })
    .select("skill scorecard endedAt")
    .lean();
  if (!attempt?.scorecard) throw notShared();
  return {
    scorecard: attempt.scorecard,
    skill: attempt.skill,
    completedAt: attempt.endedAt?.toISOString() ?? null,
  };
}
