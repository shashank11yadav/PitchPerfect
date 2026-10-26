import { ApiError } from "@/lib/api";
import { formatMonthlyReset, formatResetTime } from "@/lib/local-time";

/** What went wrong, in words for the practice room. The codes are the api's (docs/api.md). */
export interface Problem {
  code: string;
  message: string;
}

const UNAVAILABLE = "The practice partner isn’t available right now. Wait a minute and try again.";
const TWO_DAYS_SEC = 2 * 24 * 60 * 60;

const codeOf = (error: unknown) => (error instanceof ApiError ? error.code : "internal_error");

/** The local time `seconds` from now, the way the quota meter says it. */
const inLocalTime = (seconds: number) =>
  formatResetTime(new Date(Date.now() + seconds * 1000).toISOString());

function quotaMessage(error: ApiError): string {
  const seconds = error.retryAfterSec;
  if (seconds === undefined) return "You’ve used your practice sessions for now.";
  // Only the monthly limit lasts this long.
  if (seconds > TWO_DAYS_SEC) {
    return `You’ve used this month’s practice sessions. They start over ${formatMonthlyReset()}.`;
  }
  return `You’ve used your practice sessions for now. You can start another ${inLocalTime(seconds)}.`;
}

/** Why a session didn't start. */
export function startProblem(error: unknown): Problem {
  const code = codeOf(error);
  if (!(error instanceof ApiError)) return { code, message: UNAVAILABLE };
  switch (code) {
    case "quota_exceeded":
      return { code, message: quotaMessage(error) };
    case "budget_exhausted":
      return {
        code,
        message: `Practice is paused for everyone for the rest of today. It opens again ${inLocalTime(error.retryAfterSec ?? 0)}.`,
      };
    case "token_limit_reached":
      return {
        code,
        message: `You’ve used today’s practice allowance. You can start another call ${inLocalTime(error.retryAfterSec ?? 0)}.`,
      };
    case "email_not_verified":
      return {
        code,
        message: "Confirm your email before you start. The link is in the email we sent you.",
      };
    case "consent_required":
      return { code, message: "Read and accept the practice notice before your first call." };
    case "not_found":
      return {
        code,
        message: "That job isn’t listed anymore. Start without it, or pick another job.",
      };
    case "conflict":
      return {
        code,
        message:
          "Another session is still starting, maybe in another tab. Wait a few seconds and try again.",
      };
    case "rate_limited":
      return {
        code,
        message:
          "You’ve started a lot of sessions in the last hour. Take a break and try again later.",
      };
    case "network_error":
      return { code, message: error.message };
    default:
      return { code, message: UNAVAILABLE };
  }
}

/** Why a turn failed before or while streaming; the reducer words the common cases. */
export function turnProblem(error: unknown): { code: string; message?: string } {
  const code = codeOf(error);
  if (code === "rate_limited") {
    return {
      code,
      message: "That’s a lot of turns in a few minutes. Wait a moment and try again.",
    };
  }
  if (code === "token_limit_reached" && error instanceof ApiError) {
    return {
      code,
      message: `You’ve used today’s practice allowance, so your partner can’t take more turns. End the call to get your scorecard. You can practice again ${inLocalTime(error.retryAfterSec ?? 0)}.`,
    };
  }
  return { code };
}

/** Why ending or scoring failed; the session is still there, so ending can be tried again. */
export function endProblem(error: unknown): Problem {
  const code = codeOf(error);
  if (code === "conflict") {
    return { code, message: "The last reply is still finishing. Try ending again in a moment." };
  }
  if (code === "network_error" && error instanceof ApiError)
    return { code, message: error.message };
  return {
    code,
    message: "We couldn’t score the session just now. Nothing is lost: try ending it again.",
  };
}
