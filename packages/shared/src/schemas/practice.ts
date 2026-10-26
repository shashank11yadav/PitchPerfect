import { z } from "zod";
import { STAGES, type AttemptStatus, type Stage } from "../enums.js";
import { LIMITS } from "../limits.js";
import type { Scorecard } from "../rubric.js";
import type { SkillSlug } from "../skills.js";
import type { ScenarioPublic, TranscriptEntry } from "./coach.js";
import { skillSlug } from "./coach.js";
import { objectId, pageQuery, turnText } from "./common.js";

export const StartPracticeSchema = z.strictObject({
  skill: skillSlug(),
  jobId: objectId().optional(),
});
export type StartPractice = z.infer<typeof StartPracticeSchema>;

export const TurnSchema = z.strictObject({ text: turnText() });
export type Turn = z.infer<typeof TurnSchema>;

/** `GET /api/practice/attempts?skill&page&pageSize`. */
export const AttemptListQuerySchema = pageQuery.extend({ skill: skillSlug().optional() });
export type AttemptListQuery = z.infer<typeof AttemptListQuerySchema>;

export const ShareScorecardSchema = z.strictObject({ attemptId: objectId().nullable() });
export type ShareScorecard = z.infer<typeof ShareScorecardSchema>;

/** Never includes `scenarioPrivate`. */
export interface AttemptView {
  id: string;
  skill: SkillSlug;
  jobId: string | null;
  status: AttemptStatus;
  /** Conversation stage reached so far; it only moves forward. */
  stage: Stage;
  scenarioPublic: ScenarioPublic;
  transcript: TranscriptEntry[];
  scorecard: Scorecard | null;
  startedAt: string;
  endedAt: string | null;
  expiresAt: string;
}

export const PRACTICE_PARTNER_KINDS = ["scripted", "live", "browser"] as const;
/**
 * How the practice partner runs. `scripted` is the offline demo persona (`COACH_PROVIDER=fake`),
 * which runs on our own server and sends nothing to an AI provider; `live` means a real model is
 * behind the coach. Reported on `GET /api/health` and `GET /api/practice/quota` so the web app can
 * describe the partner truthfully; when the coach can't be reached it is reported as `live`.
 * `browser` is the static demo's scripted partner running in the visitor's own browser tab, which
 * the api never reports.
 */
export type PracticePartnerKind = (typeof PRACTICE_PARTNER_KINDS)[number];

/** The kinds the api reports and a student's practice consent is given for. */
export const REPORTED_PARTNER_KINDS = ["scripted", "live"] as const;
export type ReportedPartnerKind = (typeof REPORTED_PARTNER_KINDS)[number];

/** `GET /api/practice/quota`: sessions started today and this month (UTC), against the limits. */
export interface PracticeQuota {
  dailyUsed: number;
  dailyLimit: number;
  monthlyUsed: number;
  monthlyLimit: number;
  /** False when either limit is used up, `budgetExhausted`, or `tokenLimitReached`. */
  available: boolean;
  /** Today's global token budget is spent: no one can start a session until the next UTC day. */
  budgetExhausted: boolean;
  /**
   * The student has used their own tokens for today (`PRACTICE_STUDENT_DAILY_TOKEN_LIMIT`): no new
   * session or turn until the next UTC day, though a session in progress can still be scored.
   */
  tokenLimitReached: boolean;
  /** The next UTC midnight, when the daily count starts over. */
  resetsAt: string;
  practicePartner: PracticePartnerKind;
}

/** `201` from `POST /api/practice/sessions`. */
export interface StartedSession {
  attemptId: string;
  scenario: ScenarioPublic;
  /** `expiresAt` is when the session stops taking turns (20 minutes after it started). */
  limits: { maxTurns: number; maxChars: number; expiresAt: string };
}

export interface AttemptSummary {
  id: string;
  skill: SkillSlug;
  status: AttemptStatus;
  overall: number | null;
  startedAt: string;
  endedAt: string | null;
}

const ENDED_REASONS = ["guard_limit", "turn_limit", "expired"] as const;
/** Why a session stopped taking turns. */
export type EndedReason = (typeof ENDED_REASONS)[number];

/**
 * Events the browser receives from `POST /api/practice/sessions/:id/turns`. On the wire `type` is
 * the SSE event name and the remaining fields are the `data:` JSON.
 */
export const PracticeEvent = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("delta"), text: z.string() }),
  /** The partner's text so far in this turn is withdrawn; `text` is shown in its place. */
  z.strictObject({ type: z.literal("retract"), text: z.string() }),
  z.strictObject({
    type: z.literal("done"),
    stage: z.enum(STAGES),
    turnsLeft: z.number().int().min(0).max(LIMITS.maxStudentTurns),
    finalText: z.string(),
  }),
  z.strictObject({ type: z.literal("redirect"), text: z.string() }),
  /**
   * The turn signalled self-harm: `text` is a support message with crisis resources, from
   * PitchPerfect rather than the partner. The turn isn't stored or counted.
   */
  z.strictObject({ type: z.literal("support"), text: z.string() }),
  z.strictObject({ type: z.literal("ended"), reason: z.enum(ENDED_REASONS) }),
  /** `counted`: the api charged this turn (the coach had started answering before it failed). */
  z.strictObject({ type: z.literal("error"), code: z.string().min(1), counted: z.boolean() }),
]);
export type PracticeEvent = z.infer<typeof PracticeEvent>;
