import {
  isSkillSlug,
  type AttemptSummary,
  type AttemptView,
  type PracticeQuota,
  type ResumeInfo,
  type SkillSlug,
  type StartedSession,
  type StudentApplicationView,
} from "@pitchperfect/shared";
import type { Parser } from "./api";
import { isObject, pageOf, unexpected } from "./parse";

/**
 * Parsers for the student's own api answers. These responses have shared TypeScript types but no
 * zod schemas, so each parser checks the envelope the view depends on and trusts the api for the
 * rest; anything else is reported like any other bad answer.
 */

export const ApplicationsPage = pageOf<StudentApplicationView>("/me/applications");
export const AttemptsPage = pageOf<AttemptSummary>("/practice/attempts");

/** `GET /me/lessons` and `PUT /me/lessons/:skill`: completed skills, in course order. */
export const LessonsDone: Parser<SkillSlug[]> = {
  parse(data) {
    if (isObject(data) && Array.isArray(data.completed)) {
      return data.completed.filter(isSkillSlug);
    }
    throw unexpected("/me/lessons");
  },
};

export const Quota: Parser<PracticeQuota> = {
  parse(data) {
    if (
      isObject(data) &&
      typeof data.dailyUsed === "number" &&
      typeof data.dailyLimit === "number" &&
      typeof data.monthlyUsed === "number" &&
      typeof data.monthlyLimit === "number" &&
      typeof data.available === "boolean" &&
      typeof data.budgetExhausted === "boolean" &&
      typeof data.resetsAt === "string"
    ) {
      // Anything but a clear "scripted" (or the demo's "browser") is disclosed as a live model.
      const { practicePartner: kind } = data;
      const practicePartner = kind === "scripted" || kind === "browser" ? kind : "live";
      return { ...data, practicePartner } as unknown as PracticeQuota;
    }
    throw unexpected("/practice/quota");
  },
};

/** `PUT /me/resume`: `{ resume: { uploadedAt, sizeBytes } }`. */
export const ResumeUploaded: Parser<ResumeInfo> = {
  parse(data) {
    if (isObject(data) && isObject(data.resume) && typeof data.resume.uploadedAt === "string") {
      return data.resume as unknown as ResumeInfo;
    }
    throw unexpected("/me/resume");
  },
};

/** `{ application }` from withdraw. */
export const OneApplication: Parser<StudentApplicationView> = {
  parse(data) {
    if (isObject(data) && isObject(data.application) && isObject(data.application.job)) {
      return data.application as unknown as StudentApplicationView;
    }
    throw unexpected("application");
  },
};

/** `201` from `POST /practice/sessions`. */
export const StartedPractice: Parser<StartedSession> = {
  parse(data) {
    if (
      isObject(data) &&
      typeof data.attemptId === "string" &&
      isObject(data.scenario) &&
      typeof data.scenario.openingLine === "string" &&
      isObject(data.limits) &&
      typeof data.limits.expiresAt === "string"
    ) {
      return data as unknown as StartedSession;
    }
    throw unexpected("/practice/sessions");
  },
};

/** `{ attempt }` from `GET /practice/sessions/:id` and `POST /practice/sessions/:id/end`. */
export const OneAttempt: Parser<AttemptView> = {
  parse(data) {
    if (
      isObject(data) &&
      isObject(data.attempt) &&
      isSkillSlug(data.attempt.skill) &&
      isObject(data.attempt.scenarioPublic) &&
      Array.isArray(data.attempt.transcript)
    ) {
      return data.attempt as unknown as AttemptView;
    }
    throw unexpected("attempt");
  },
};
