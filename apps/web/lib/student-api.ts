import {
  isSkillSlug,
  type AttemptSummary,
  type Page,
  type PracticeQuota,
  type ResumeInfo,
  type SkillSlug,
  type StudentApplicationView,
} from "@pitchperfect/shared";
import { ApiError, type Parser } from "./api";

/**
 * Parsers for the student's own api answers. These responses have shared TypeScript types but no
 * zod schemas, so each parser checks the envelope the view depends on and trusts the api for the
 * rest; anything else is reported like any other bad answer.
 */

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const unexpected = (what: string) =>
  new ApiError(502, "internal_error", `Unexpected ${what} response`);

/** `{ items, page, pageSize, total }`. */
function pageOf<T>(what: string): Parser<Page<T>> {
  return {
    parse(data) {
      if (
        isObject(data) &&
        Array.isArray(data.items) &&
        typeof data.page === "number" &&
        typeof data.pageSize === "number" &&
        typeof data.total === "number"
      ) {
        return data as unknown as Page<T>;
      }
      throw unexpected(what);
    },
  };
}

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
      typeof data.resetsAt === "string"
    ) {
      return data as unknown as PracticeQuota;
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
