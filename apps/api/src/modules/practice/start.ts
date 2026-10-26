import {
  LIMITS,
  type CoachPlanRequest,
  type StartedSession,
  type StartPractice,
} from "@pitchperfect/shared";
import { toAttemptView } from "../../db/mappers.js";
import { PracticeAttempt, StudentProfile } from "../../db/models/index.js";
import { ConflictError } from "../../errors.js";
import { htmlToPlainText } from "../../services/html-sanitizer.js";
import { isDuplicateKey } from "../auth/service.js";
import { findListedJob } from "../jobs/service.js";
import {
  recordUsage,
  refundStart,
  removePlaceholder,
  removeStalePlaceholders,
  reserveStart,
  STALE_START_MS,
} from "./quota.js";
import { coachOf, sessionEndsAt, type PracticeDeps } from "./service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Job text sent to the planner is clipped to this many characters. */
const JOB_TEXT_MAX_CHARS = 4000;

async function planRequest(studentId: string, input: StartPractice): Promise<CoachPlanRequest> {
  const listed = input.jobId ? await findListedJob({ _id: input.jobId }) : undefined;
  const profile = await StudentProfile.findOne({ userId: studentId })
    .select("targetRole industry")
    .lean();
  const job = listed?.job;
  return {
    skill: input.skill,
    ...(profile?.targetRole ? { targetRole: profile.targetRole } : {}),
    ...(profile?.industry ? { industry: profile.industry } : {}),
    ...(job
      ? {
          job: {
            title: job.title,
            descriptionText: htmlToPlainText(job.descriptionHtml).slice(0, JOB_TEXT_MAX_CHARS),
            skills: [...job.skills],
          },
        }
      : {}),
  };
}

/**
 * Inserts the student's `starting` placeholder. The partial unique index allows one `starting` or
 * `active` attempt per student, so of several parallel starts only one gets here; the rest are
 * `409 conflict`.
 */
async function claimStart(deps: PracticeDeps, studentId: string, input: StartPractice, now: Date) {
  try {
    return await PracticeAttempt.create({
      studentId,
      skill: input.skill,
      jobId: input.jobId,
      status: "starting",
      startedAt: now,
      expiresAt: new Date(now.getTime() + deps.config.PRACTICE_RETENTION_DAYS * DAY_MS),
    });
  } catch (error) {
    if (isDuplicateKey(error, "studentId")) {
      throw new ConflictError("conflict", "A practice session is already starting");
    }
    throw error;
  }
}

/**
 * Starts a session: reserves one of the student's sessions (checking quota and budget), abandons
 * the student's active one, claims a `starting` placeholder, plans the scenario, and activates it.
 * A start that never gets a plan gives its session back.
 */
export async function startSession(
  deps: PracticeDeps,
  studentId: string,
  input: StartPractice,
): Promise<StartedSession> {
  const coach = coachOf(deps);
  const request = await planRequest(studentId, input);
  const now = new Date();

  await removeStalePlaceholders(new Date(now.getTime() - STALE_START_MS), studentId);
  // Reserved first, so a refused start leaves the current session untouched. That session already
  // counts toward the quota.
  await reserveStart(deps.config, studentId, now);
  await PracticeAttempt.updateMany(
    { studentId, status: "active" },
    { $set: { status: "abandoned", endedAt: now, turnLockUntil: null } },
  );
  let placeholder;
  try {
    placeholder = await claimStart(deps, studentId, input, now);
  } catch (error) {
    await refundStart(studentId, now);
    throw error;
  }

  let plan;
  try {
    plan = await coach.plan(request);
  } catch (error) {
    await removePlaceholder(placeholder);
    throw error;
  }
  const attempt = await PracticeAttempt.findOneAndUpdate(
    { _id: placeholder._id, status: "starting" },
    {
      $set: {
        status: "active",
        scenarioPublic: plan.scenarioPublic,
        scenarioPrivate: plan.scenarioPrivate,
        provider: plan.usage.provider,
        model: plan.usage.model,
        tokens: { input: plan.usage.inputTokens, output: plan.usage.outputTokens },
      },
    },
    { returnDocument: "after" },
  );
  await recordUsage(plan.usage, new Date(), { session: true });
  if (!attempt) throw new ConflictError("conflict", "That practice session was replaced");

  return {
    attemptId: attempt.id,
    scenario: toAttemptView(attempt).scenarioPublic,
    limits: {
      maxTurns: LIMITS.maxStudentTurns,
      maxChars: LIMITS.turnMaxChars,
      expiresAt: sessionEndsAt(attempt).toISOString(),
    },
  };
}
