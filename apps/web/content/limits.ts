import { LIMITS } from "@pitchperfect/shared";

/**
 * The limits as the public pages state them. Everything comes from the shared `LIMITS`, so the
 * copy can't drift from what the api enforces. The two session quotas are only defaults: the api
 * can override them (PRACTICE_DAILY_LIMIT, PRACTICE_MONTHLY_LIMIT), so the copy says "by default".
 */
export const COPY_LIMITS = {
  turns: String(LIMITS.maxStudentTurns),
  minutes: String(LIMITS.sessionSeconds / 60),
  characters: LIMITS.turnMaxChars.toLocaleString("en-US"),
  retentionDays: String(LIMITS.attemptRetentionDays),
  dailyQuota: String(LIMITS.dailyQuota),
  monthlyQuota: String(LIMITS.monthlyQuota),
  resumeMegabytes: String(LIMITS.resumeMaxBytes / (1024 * 1024)),
  verifyHours: String(LIMITS.verifyTokenHours),
  resetMinutes: String(LIMITS.resetTokenMinutes),
  sessionRollingDays: String(LIMITS.sessionRollingDays),
  sessionAbsoluteDays: String(LIMITS.sessionAbsoluteDays),
  signinDeviceDays: String(LIMITS.signinDeviceDays),
} as const;

const L = COPY_LIMITS;

/** "Up to 20 of your turns or 20 minutes, with up to 1,000 characters per turn." */
export const SESSION_LENGTH = `up to ${L.turns} of your turns or ${L.minutes} minutes, whichever comes first, with up to ${L.characters} characters per turn`;

/** The quota sentence, marked as a default because the api's environment can change it. */
export const SESSION_QUOTA = `By default, each student can start ${L.dailyQuota} practice sessions a day and ${L.monthlyQuota} a month`;
