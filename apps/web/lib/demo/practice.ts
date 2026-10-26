import {
  createPracticeDeps,
  createUsageMeter,
  InputError,
  NotEnoughTurnsError,
  planScenario,
  runTurn,
  sanitizeInput,
  scoreTranscript,
  turnErrorCode,
  type PracticeDeps,
  type TurnSink,
} from "@pitchperfect/partner";
import { FakeProvider } from "@pitchperfect/scripted-partner";
import {
  CHECK_IN_LINE,
  LIMITS,
  maySignalSelfHarm,
  redactReply,
  redactTurn,
  secondsUntil,
  signalsSelfHarm,
  STAGES,
  SUPPORT_LINE,
  type AttemptListQuery,
  type AttemptSummary,
  type AttemptView,
  type CoachPlanRequest,
  type CoachTurnEvent,
  type CoachTurnRequest,
  type EndedReason,
  type Page,
  type PracticeEvent,
  type PracticeQuota,
  type SkillSlug,
  type Stage,
  type StartedSession,
  type StartPractice,
  type TranscriptEntry,
  utcDay,
  utcMonth,
} from "@pitchperfect/shared";
import { ApiError } from "@/lib/api";
import { htmlToText } from "@/lib/plain-text";
import { findDemoJobById } from "./jobs";
import { readDemoState, updateDemoState, type StoredAttempt } from "./store";

/**
 * The api's practice rules, run in the browser for the static demo: one live session, the turn
 * and time limits, PII redaction, the guard-flag limit, and a scorecard only for a call with two
 * real turns. The partner itself is the engine the coach runs, with its scripted provider.
 */

const MIN_SCORED_TURNS = 2;
const SESSION_MS = LIMITS.sessionSeconds * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** The coach's own per-call timeout; the scripted partner answers at once anyway. */
const TIMEOUT_MS = 30_000;
/** Job text handed to the planner is clipped as the api clips it. */
const JOB_TEXT_MAX_CHARS = 4000;
/** The coach's turn-request transcript cap. */
const TRANSCRIPT_MAX = 40;

/** Each call gets its own seed, so a visitor who practices twice meets a different buyer. */
const depsFor = (seed: number): PracticeDeps =>
  createPracticeDeps({ COACH_TIMEOUT_MS: TIMEOUT_MS }, new FakeProvider({ seed }));

const notFound = () => new ApiError(404, "not_found", "We can’t find that session.");

const studentTurnsOf = (view: AttemptView) =>
  view.transcript.filter((entry) => entry.role === "student").length;

const laterStage = (stored: Stage, next: Stage): Stage =>
  STAGES.indexOf(next) > STAGES.indexOf(stored) ? next : stored;

const startedBetween = (attempts: readonly StoredAttempt[], from: Date, to: Date) =>
  attempts.filter(({ view }) => {
    const at = Date.parse(view.startedAt);
    return at >= from.getTime() && at < to.getTime();
  }).length;

function findStored(id: string): StoredAttempt {
  const stored = readDemoState().attempts.find(({ view }) => view.id === id);
  if (!stored) throw notFound();
  return stored;
}

function saveAttempt(next: StoredAttempt): void {
  updateDemoState((state) => ({
    ...state,
    attempts: state.attempts.map((stored) => (stored.view.id === next.view.id ? next : stored)),
  }));
}

/** `GET /api/practice/quota`: this tab's calls today and this month against the product limits. */
export function demoQuota(now = new Date()): PracticeQuota {
  const { attempts } = readDemoState();
  const dailyUsed = startedBetween(attempts, utcDay(now), utcDay(now, 1));
  const monthlyUsed = startedBetween(attempts, utcMonth(now), utcMonth(now, 1));
  return {
    dailyUsed,
    dailyLimit: LIMITS.dailyQuota,
    monthlyUsed,
    monthlyLimit: LIMITS.monthlyQuota,
    available: dailyUsed < LIMITS.dailyQuota && monthlyUsed < LIMITS.monthlyQuota,
    budgetExhausted: false,
    tokenLimitReached: false,
    resetsAt: utcDay(now, 1).toISOString(),
    practicePartner: "browser",
  };
}

function planRequest(input: StartPractice): CoachPlanRequest {
  const found = input.jobId ? findDemoJobById(input.jobId) : undefined;
  if (input.jobId && !found) {
    throw new ApiError(404, "not_found", "That job isn’t listed anymore.");
  }
  return {
    skill: input.skill,
    ...(found && {
      job: {
        title: found.job.title,
        descriptionText: htmlToText(found.job.descriptionHtml).slice(0, JOB_TEXT_MAX_CHARS),
        skills: [...found.job.skills],
      },
    }),
  };
}

/** `POST /api/practice/sessions`: quota, then a planned scenario; an older live call is abandoned. */
export async function startDemoSession(
  input: StartPractice,
  now = new Date(),
): Promise<StartedSession> {
  const quota = demoQuota(now);
  if (quota.monthlyUsed >= quota.monthlyLimit) {
    throw new ApiError(429, "quota_exceeded", "", {}, secondsUntil(now, utcMonth(now, 1)));
  }
  if (quota.dailyUsed >= quota.dailyLimit) {
    throw new ApiError(429, "quota_exceeded", "", {}, secondsUntil(now, utcDay(now, 1)));
  }
  const request = planRequest(input);
  const seed = readDemoState().attempts.length + 1;
  const plan = await planScenario(depsFor(seed), request, new AbortController().signal);

  const view: AttemptView = {
    id: crypto.randomUUID(),
    skill: input.skill,
    jobId: input.jobId ?? null,
    status: "active",
    stage: "opening",
    scenarioPublic: plan.scenarioPublic,
    transcript: [],
    scorecard: null,
    startedAt: now.toISOString(),
    endedAt: null,
    expiresAt: new Date(now.getTime() + LIMITS.attemptRetentionDays * DAY_MS).toISOString(),
  };
  updateDemoState((state) => ({
    ...state,
    attempts: [
      ...state.attempts.map((stored): StoredAttempt =>
        stored.view.status === "active"
          ? {
              ...stored,
              view: { ...stored.view, status: "abandoned", endedAt: view.startedAt },
            }
          : stored,
      ),
      { view, scenarioPrivate: plan.scenarioPrivate, guardFlags: 0, seed },
    ],
  }));
  return {
    attemptId: view.id,
    scenario: view.scenarioPublic,
    limits: {
      maxTurns: LIMITS.maxStudentTurns,
      maxChars: LIMITS.turnMaxChars,
      expiresAt: new Date(now.getTime() + SESSION_MS).toISOString(),
    },
  };
}

/** `GET /api/practice/sessions/:id`. */
export const getDemoAttempt = (id: string): AttemptView => findStored(id).view;

/** `GET /api/practice/attempts`: newest first, optionally one skill's. */
export function listDemoAttempts({
  skill,
  page,
  pageSize,
}: AttemptListQuery): Page<AttemptSummary> {
  const all = readDemoState()
    .attempts.map(({ view }) => view)
    .filter((view) => !skill || view.skill === skill)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const items = all.slice((page - 1) * pageSize, page * pageSize).map((view) => ({
    id: view.id,
    skill: view.skill,
    status: view.status,
    overall: view.scorecard?.overall ?? null,
    startedAt: view.startedAt,
    endedAt: view.endedAt,
  }));
  return { items, page, pageSize, total: all.length };
}

/** `DELETE /api/practice/attempts/:id`. */
export function deleteDemoAttempt(id: string): void {
  findStored(id);
  updateDemoState((state) => ({
    ...state,
    attempts: state.attempts.filter(({ view }) => view.id !== id),
  }));
}

/**
 * Unflagged entries, without any student line that may signal self-harm: re-checked here so a
 * line stored before the rules caught it is never scored, nor counted toward a score.
 */
const usable = (view: AttemptView): TranscriptEntry[] =>
  view.transcript
    .filter(
      (entry) => !entry.flagged && !(entry.role === "student" && maySignalSelfHarm(entry.text)),
    )
    .map(({ role, text }) => ({ role, text }));

function finish(stored: StoredAttempt, status: "completed" | "abandoned", now: Date) {
  const view: AttemptView = { ...stored.view, status, endedAt: now.toISOString() };
  saveAttempt({ ...stored, view });
  return view;
}

/**
 * `POST /api/practice/sessions/:id/end`: scored with two or more unflagged student turns, else
 * abandoned. A session that already ended is returned as it is.
 */
export async function endDemoSession(id: string, now = new Date()): Promise<AttemptView> {
  const stored = findStored(id);
  if (stored.view.status !== "active") return stored.view;
  const transcript = usable(stored.view);
  if (transcript.filter((entry) => entry.role === "student").length < MIN_SCORED_TURNS) {
    return finish(stored, "abandoned", now);
  }
  try {
    const { scorecard } = await scoreTranscript(
      depsFor(stored.seed),
      {
        skill: stored.view.skill,
        scenarioPublic: stored.view.scenarioPublic,
        scenarioPrivate: stored.scenarioPrivate,
        transcript,
      },
      new AbortController().signal,
    );
    return finish({ ...stored, view: { ...stored.view, scorecard } }, "completed", now);
  } catch (error) {
    if (error instanceof NotEnoughTurnsError) return finish(stored, "abandoned", now);
    throw error;
  }
}

/** Why a session can't take a turn, if it can't. */
function endedReason(view: AttemptView, now: Date): EndedReason | null {
  if (view.status === "ended_by_guard") return "guard_limit";
  if (studentTurnsOf(view) >= LIMITS.maxStudentTurns) return "turn_limit";
  if (now.getTime() >= Date.parse(view.startedAt) + SESSION_MS) return "expired";
  return null;
}

/**
 * `POST /api/practice/sessions/:id/turns`: the student's text, redacted, through the partner;
 * `onEvent` receives what the api would stream. The transcript, stage and guard flags are stored
 * as the api stores them. A failed turn is reported, and charged only once the reply had begun.
 */
export async function runDemoTurn(
  id: string,
  text: string,
  onEvent: (event: PracticeEvent) => void,
  signal: AbortSignal,
  now = new Date(),
): Promise<void> {
  const stored = findStored(id);
  const { view } = stored;
  let studentText: string;
  try {
    sanitizeInput(text);
    studentText = redactTurn(text);
  } catch (error) {
    if (error instanceof InputError) {
      throw new ApiError(400, "validation_failed", "Your message must be 1–1000 characters.");
    }
    throw error;
  }
  // As on the api: a student in crisis gets the support message before anything that could
  // refuse the turn (an ended session, the turn limit, the time limit). Nothing is kept. The
  // scripted partner has no model guard to read an unclear line, so that gets a gentle check-in.
  if (maySignalSelfHarm(text)) {
    onEvent({ type: "support", text: signalsSelfHarm(text) ? SUPPORT_LINE : CHECK_IN_LINE });
    return;
  }
  if (view.status !== "active" && view.status !== "ended_by_guard") {
    throw new ApiError(409, "conflict", "This practice session has ended");
  }
  const reason = endedReason(view, now);
  if (reason) {
    onEvent({ type: "ended", reason });
    return;
  }
  const request: CoachTurnRequest = {
    skill: view.skill,
    scenarioPublic: view.scenarioPublic,
    scenarioPrivate: stored.scenarioPrivate,
    transcript: view.transcript
      .slice(-TRANSCRIPT_MAX)
      .map(({ role, text: line, flagged }) =>
        flagged ? { role, text: line, flagged } : { role, text: line },
      ),
    studentText,
    currentStage: view.stage,
  };
  const turnsLeft = LIMITS.maxStudentTurns - (studentTurnsOf(view) + 1);
  const student: TranscriptEntry = { role: "student", text: studentText, at: now.toISOString() };
  /** `started` once the partner has sent anything; `saved` once the turn's outcome is stored. */
  const progress = { started: false, saved: false };

  const sink: TurnSink = {
    send: (event: CoachTurnEvent) => {
      progress.started = true;
      switch (event.type) {
        case "delta":
          onEvent({ type: "delta", text: event.text });
          break;
        case "retract":
          onEvent({ type: "retract", text: redactReply(event.text) });
          break;
        case "done": {
          const finalText = redactReply(event.finalText);
          const stage = laterStage(view.stage, event.stage);
          const partner: TranscriptEntry = {
            role: "partner",
            text: finalText,
            at: new Date().toISOString(),
          };
          saveAttempt({
            ...stored,
            view: { ...view, stage, transcript: [...view.transcript, student, partner] },
          });
          progress.saved = true;
          onEvent({ type: "done", stage, turnsLeft, finalText });
          if (turnsLeft === 0) onEvent({ type: "ended", reason: "turn_limit" });
          break;
        }
        case "redirect": {
          // Every redirected turn is flagged; only a confirmed attack counts toward the limit.
          const line = redactReply(event.text);
          const guardFlags = stored.guardFlags + (event.strike ? 1 : 0);
          const endedByGuard = guardFlags >= LIMITS.guardFlagLimit;
          const partner: TranscriptEntry = {
            role: "partner",
            text: line,
            at: new Date().toISOString(),
            flagged: true,
          };
          saveAttempt({
            ...stored,
            guardFlags,
            view: {
              ...view,
              transcript: [...view.transcript, { ...student, flagged: true }, partner],
              ...(endedByGuard && { status: "ended_by_guard", endedAt: new Date().toISOString() }),
            },
          });
          progress.saved = true;
          onEvent({ type: "redirect", text: line });
          if (endedByGuard) onEvent({ type: "ended", reason: "guard_limit" });
          else if (turnsLeft === 0) onEvent({ type: "ended", reason: "turn_limit" });
          break;
        }
        case "support":
          // As on the api: the turn signalled self-harm, so its words are not kept and it uses
          // no turn. The scripted partner makes no model calls, so there is no usage to keep.
          progress.saved = true;
          onEvent({ type: "support", text: event.text });
          break;
        case "error":
          // The engine reports failures by throwing; this event never reaches the sink.
          break;
      }
      return Promise.resolve();
    },
  };

  try {
    await runTurn(request, {
      deps: depsFor(stored.seed),
      signal,
      meter: createUsageMeter(),
      sink,
    });
  } catch (error) {
    if (signal.aborted) return;
    // A reply that had begun still used the turn, as on the api: the line stays, flagged.
    if (progress.started && !progress.saved) {
      saveAttempt({
        ...stored,
        view: { ...view, transcript: [...view.transcript, { ...student, flagged: true }] },
      });
    }
    onEvent({ type: "error", code: turnErrorCode(error), counted: progress.started });
  }
}

/** `POST /api/me/practice-consent`. */
export function acceptDemoConsent(now = new Date()): string {
  const consentAt = now.toISOString();
  updateDemoState((state) => ({ ...state, consentAt }));
  return consentAt;
}

/** `GET /api/me/lessons` and `PUT /api/me/lessons/:skill`. */
export function demoLessonsDone(): SkillSlug[] {
  return readDemoState().lessonsDone;
}

export function setDemoLessonDone(skill: SkillSlug, done: boolean): SkillSlug[] {
  return updateDemoState((state) => ({
    ...state,
    lessonsDone: done
      ? [...new Set([...state.lessonsDone, skill])]
      : state.lessonsDone.filter((slug) => slug !== skill),
  })).lessonsDone;
}
