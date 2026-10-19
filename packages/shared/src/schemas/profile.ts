import { z } from "zod";
import { US_STATE_CODES, type UsStateCode } from "../enums.js";
import { LIMITS } from "../limits.js";
import type { SkillSlug } from "../skills.js";
import { skillSlug } from "./coach.js";
import { nameField, shortText } from "./common.js";

/** Allowed graduation years relative to the current (UTC) year. */
export function gradYearRange(now: Date = new Date()): { min: number; max: number } {
  const year = now.getUTCFullYear();
  return { min: year - LIMITS.gradYearPast, max: year + LIMITS.gradYearFuture };
}

// The range is read on every parse so it follows the clock.
const gradYear = () =>
  z
    .number()
    .int()
    .refine(
      (value) => {
        const { min, max } = gradYearRange();
        return value >= min && value <= max;
      },
      { message: "Graduation year is out of range" },
    );

/** Name fields shared by both roles. */
export const nameFields = {
  firstName: nameField(),
  lastName: nameField(),
};

/** Role fields collected from students at signup; also editable later. */
export const studentFields = {
  school: shortText(),
  major: shortText(),
  gradYear: gradYear(),
  targetRole: shortText(),
  industry: shortText(),
  state: z.enum(US_STATE_CODES),
};

/** Role fields collected from employers at signup; also editable later. */
export const employerFields = {
  jobTitle: shortText(),
};

export const StudentProfileUpdateSchema = z
  .strictObject({ ...nameFields, ...studentFields })
  .partial();
export type StudentProfileUpdate = z.infer<typeof StudentProfileUpdateSchema>;

export const EmployerProfileUpdateSchema = z
  .strictObject({ ...nameFields, ...employerFields })
  .partial();
export type EmployerProfileUpdate = z.infer<typeof EmployerProfileUpdateSchema>;

/** `POST /api/me/practice-consent`: the student accepted the practice notice. */
export const PracticeConsentSchema = z.strictObject({ accepted: z.literal(true) });
export type PracticeConsent = z.infer<typeof PracticeConsentSchema>;

/** `PUT /api/me/lessons/:skill`: mark a lesson done or not done. */
export const LessonProgressSchema = z.strictObject({ completed: z.boolean() });
export type LessonProgress = z.infer<typeof LessonProgressSchema>;

/** `:skill` route parameter. */
export const SkillParamSchema = z.strictObject({ skill: skillSlug() });

/** Returned by `GET /api/auth/me` for students. The résumé file id is never exposed. */
export interface StudentProfileView {
  school: string;
  major: string;
  gradYear: number;
  targetRole: string;
  industry: string;
  state: UsStateCode;
  hasResume: boolean;
  lessonsCompleted: SkillSlug[];
}

/** Returned by `GET /api/auth/me` for employers. */
export interface EmployerProfileView {
  jobTitle: string;
  companyId: string;
}

/** Returned after a résumé upload. The file itself is only served to its owner. */
export interface ResumeInfo {
  uploadedAt: string;
  sizeBytes: number;
}
