import type { Types } from "mongoose";
import {
  isMeetingServiceHost,
  isSampleWebsite,
  MEETING_SERVICE_NAMES,
  scoredStudentTurns,
  type ApplicationStatus,
  type EmployerApplicationListQuery,
  type EmployerApplicationView,
  type Interview,
  type Page,
  type SharedScorecardView,
} from "@pitchperfect/shared";
import { sharesScorecard, toEmployerApplicationView } from "../../db/mappers.js";
import { Application, PracticeAttempt, StudentProfile, User } from "../../db/models/index.js";
import { ConflictError, NotFoundError, ValidationError } from "../../errors.js";
import {
  badgeDomain,
  registrableDomain,
  sameCompanyDomain,
} from "../../services/company-verification.js";
import * as emails from "../../services/email-templates.js";
import { sendSafely, type LinkingMailer, type MailFailureLog } from "../../services/mailer.js";
import { anyOf, OPEN_STATUSES } from "../applications/closing.js";
import { appliedResumeId, resumeAccessOpen } from "../applications/resume-copies.js";
import { completedAttemptIds } from "../applications/service.js";
import { transitionApplication } from "../applications/transitions.js";
import { appLink } from "../auth/service.js";
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
            resumeAccessOpen(application) && sharesScorecard(application, completed),
            resumeAccessOpen(application) &&
              appliedResumeId(application, profile.resumeFileId) !== null,
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
  // A decision ends the application, which starts the résumé's grace period.
  const ended = OPEN_STATUSES.includes(to) ? {} : { endedAt: new Date() };
  const updated = await Application.findOneAndUpdate(
    { _id: application._id, status: from },
    // Only the interview endpoint sets `interview`, so any status set here ends the slot.
    { $set: { status: to, ...ended }, $unset: { interview: 1 } },
    { returnDocument: "after" },
  ).lean();
  if (!updated) throw changedMeanwhile();
  return viewOf(updated);
}

/** A withdrawn application shares nothing: the student has pulled their résumé and scorecard back. */
export function assertNotWithdrawn(application: ApplicationDoc): void {
  if (application.status === "withdrawn") throw new NotFoundError();
}

/**
 * The résumé file this employer may download for the application: the copy made when the student
 * applied, while the application is open and for the grace period after it ended. 404 otherwise,
 * the same as for an application without one.
 */
export async function resumeForEmployer(application: ApplicationDoc): Promise<Types.ObjectId> {
  const none = () => new NotFoundError("No résumé to download");
  if (!resumeAccessOpen(application)) throw none();
  const profile =
    application.resumeFileId === undefined
      ? await StudentProfile.findOne({ userId: application.studentId })
          .select("resumeFileId")
          .lean()
      : null;
  const fileId = appliedResumeId(application, profile?.resumeFileId);
  if (!fileId) throw none();
  return fileId;
}

/**
 * A meeting link must open a known video call service (or a subdomain of one) or the company's
 * own domain; anything else is a `meetingUrl` field error. The schema already made it an https URL
 * without credentials.
 */
function assertMeetingLink(company: CompanyDoc, meetingUrl: string): void {
  const { hostname } = new URL(meetingUrl);
  const allowed =
    !hostname.endsWith(".") &&
    (isMeetingServiceHost(hostname) || sameCompanyDomain(hostname, company.website));
  if (allowed) return;
  const domain = registrableDomain(company.website);
  throw new ValidationError({
    meetingUrl: `Use a ${MEETING_SERVICE_NAMES} link${domain ? `, or one on ${domain}` : ""}`,
  });
}

/** A private bookmark: setting it again changes nothing, and the student's `updatedAt` stays put. */
export async function setSaved(application: ApplicationDoc, saved: boolean): Promise<void> {
  await Application.updateOne(
    { _id: application._id },
    { $set: { savedByEmployer: saved } },
    { timestamps: false },
  );
}

/**
 * Schedules (or reschedules) the interview, moves the application to `interview`, and emails the
 * student. The link must open a known video call service or the company's own domain.
 */
export async function scheduleInterview(
  { mailer, config }: LinkingMailer,
  log: MailFailureLog,
  company: CompanyDoc,
  { application, job }: { application: ApplicationDoc; job: JobDoc },
  { startsAt, meetingUrl }: Interview,
): Promise<EmployerApplicationView> {
  assertMeetingLink(company, meetingUrl);
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
      companyVerification: company.verification,
      companySample: isSampleWebsite(company.website),
      companyDomain: badgeDomain(company) ?? new URL(company.website).hostname,
      startsAtUtc,
      meetingUrl,
      jobLink: appLink(config, `/jobs/${job.slug}`),
    });
    await sendSafely(mailer, { to: student.email, ...content }, log, "interview_scheduled");
  }
  return viewOf(updated);
}

/**
 * The scorecard the student shared with this application, if it is still there and finished and
 * the employer's access window (the résumé's) is open, with what it rests on: the scored student
 * turns, the partner that ran the call, and how long the call lasted.
 */
export async function sharedScorecard(application: ApplicationDoc): Promise<SharedScorecardView> {
  const notShared = () => new NotFoundError("No scorecard has been shared", "not_shared");
  if (!application.sharedAttemptId || !resumeAccessOpen(application)) throw notShared();
  const attempt = await PracticeAttempt.findOne({
    _id: application.sharedAttemptId,
    studentId: application.studentId,
    status: "completed",
  })
    .select("skill scorecard provider transcript startedAt endedAt")
    .lean();
  if (!attempt?.scorecard) throw notShared();
  const lastLine = attempt.transcript.at(-1)?.at;
  return {
    scorecard: attempt.scorecard,
    skill: attempt.skill,
    completedAt: attempt.endedAt?.toISOString() ?? null,
    studentTurns: scoredStudentTurns(attempt.transcript),
    partner: attempt.provider === "fake" ? "scripted" : "live",
    durationSeconds: lastLine
      ? Math.round((lastLine.getTime() - attempt.startedAt.getTime()) / 1000)
      : null,
  };
}
