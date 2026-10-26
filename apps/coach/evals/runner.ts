import {
  CoachTurnEvent,
  LIMITS,
  redactPii,
  type CoachPlanResponse,
  type CoachScoreResponse,
  type RubricKey,
  type Stage,
  type TranscriptEntry,
} from "@pitchperfect/shared";
import { signRequest } from "@pitchperfect/shared/hmac";
import type { FastifyInstance } from "fastify";
import { buildCoachApp } from "../src/app.js";
import type { CoachConfig } from "../src/config.js";
import type { LlmProvider } from "../src/providers/index.js";
import type { EvalCase, GuardOutcome } from "./case-schema.js";
import { leakProblems, replyProblems } from "./reply-checks.js";

const DEFAULT_CONCURRENCY = 3;

interface EvalResult {
  id: string;
  kind: EvalCase["kind"];
  pass: boolean;
  /** The scorecard's overall score; quality cases that were scored only. */
  overall?: number;
  expected: EvalCase["expect"];
  /** What the guards did with the case's attack turns (quality cases: `ok` when nothing was flagged). */
  guard?: GuardOutcome;
  /** Why the case failed; empty when it passed. */
  notes: string[];
}

export interface EvalReport {
  total: number;
  passed: number;
  passRate: number;
  adversarialPassed: number;
  adversarialTotal: number;
  results: EvalResult[];
}

export interface RunEvalsOptions {
  config: CoachConfig;
  provider: LlmProvider;
  cases: readonly EvalCase[];
  concurrency?: number;
}

/**
 * What one student turn produced: a reply, an in-character redirect (a strike when the guards
 * confirmed an attack), the out-of-character support message, or a refusal (HTTP 400).
 */
type TurnOutcome =
  | { kind: "ok"; text: string; streamed: string; stage: Stage }
  | { kind: "redirect"; text: string; streamed: string; strike: boolean }
  | { kind: "support"; text: string; streamed: string }
  | { kind: "rejected" };

const isStrike = (outcome: TurnOutcome) => outcome.kind === "redirect" && outcome.strike;

/** Signed JSON POST through the real app, the way the api calls the coach. */
function caller(app: FastifyInstance, secret: string) {
  return (path: string, body: unknown) => {
    const payload = JSON.stringify(body);
    const signature = signRequest(
      secret,
      { method: "POST", path, body: payload },
      Math.floor(Date.now() / 1000),
    );
    return app.inject({
      method: "POST",
      url: path,
      headers: { "content-type": "application/json", ...signature },
      payload,
    });
  };
}

type Post = ReturnType<typeof caller>;

const httpError = (path: string, status: number, body: string) =>
  new Error(`${path} failed with HTTP ${String(status)}: ${body.slice(0, 120)}`);

async function postJson<T>(post: Post, path: string, body: unknown): Promise<T> {
  const res = await post(path, body);
  if (res.statusCode !== 200) throw httpError(path, res.statusCode, res.body);
  return res.json<T>();
}

function sseEvents(body: string): CoachTurnEvent[] {
  return body
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => CoachTurnEvent.parse(JSON.parse(line.slice("data: ".length)) as unknown));
}

/** One student turn. Like the api, it redacts personal data before forwarding the text. */
async function playTurn(
  post: Post,
  c: EvalCase,
  plan: CoachPlanResponse,
  transcript: TranscriptEntry[],
  studentText: string,
  stage: Stage | undefined,
): Promise<TurnOutcome> {
  const res = await post("/v1/turn", {
    skill: c.skill,
    scenarioPublic: plan.scenarioPublic,
    scenarioPrivate: plan.scenarioPrivate,
    transcript,
    studentText: redactPii(studentText),
    currentStage: stage,
  });
  if (res.statusCode === 400) return { kind: "rejected" };
  if (res.statusCode !== 200) throw httpError("/v1/turn", res.statusCode, res.body);

  const events = sseEvents(res.body);
  const streamed = events.flatMap((e) => (e.type === "delta" ? [e.text] : [])).join("");
  for (const event of events) {
    if (event.type === "done") {
      return { kind: "ok", text: event.finalText, streamed, stage: event.stage };
    }
    if (event.type === "redirect") {
      return { kind: "redirect", text: event.text, streamed, strike: event.strike };
    }
    if (event.type === "support") return { kind: "support", text: event.text, streamed };
    if (event.type === "error") throw new Error(`/v1/turn sent an error event: ${event.code}`);
  }
  throw new Error("/v1/turn ended without a done, redirect or support event");
}

interface Conversation {
  outcomes: TurnOutcome[];
  transcript: TranscriptEntry[];
  plan: CoachPlanResponse;
}

/**
 * Plans a scenario and plays the student turns against it, stopping once the guard-flag limit of
 * strikes is reached (the api ends the session there). A refused turn, and one answered with the
 * support message, leave no trace in the transcript, as on the api.
 */
async function converse(post: Post, c: EvalCase): Promise<Conversation> {
  const plan = await postJson<CoachPlanResponse>(post, "/v1/plan", {
    skill: c.skill,
    targetRole: c.targetRole,
    industry: c.industry,
    job: c.job,
  });
  const transcript: TranscriptEntry[] = [
    { role: "partner", text: plan.scenarioPublic.openingLine },
  ];
  const outcomes: TurnOutcome[] = [];
  let stage: Stage | undefined;
  let flags = 0;

  for (const studentText of c.studentTurns) {
    if (flags >= LIMITS.guardFlagLimit) break;
    const outcome = await playTurn(post, c, plan, transcript, studentText, stage);
    outcomes.push(outcome);
    if (outcome.kind === "rejected" || outcome.kind === "support") continue;
    const flagged = outcome.kind === "redirect";
    transcript.push(
      { role: "student", text: redactPii(studentText), ...(flagged ? { flagged } : {}) },
      { role: "partner", text: outcome.text },
    );
    if (outcome.kind === "ok") stage = outcome.stage;
    else if (isStrike(outcome)) flags += 1;
  }
  return { outcomes, transcript, plan };
}

/**
 * Leaks in what was streamed, and problems with each reply that was sent. The support message is
 * PitchPerfect's own fixed text, not partner speech, and names a helpline's web address on purpose.
 */
function replyNotes(outcomes: readonly TurnOutcome[]): string[] {
  return outcomes.flatMap((outcome, index) => {
    if (outcome.kind === "rejected" || outcome.kind === "support") return [];
    const where = `turn ${String(index + 1)} reply`;
    return [
      ...leakProblems(outcome.streamed).map((problem) => `${where} (streamed) ${problem}`),
      ...replyProblems(outcome.text).map((problem) => `${where} ${problem}`),
    ];
  });
}

const inside = (value: number, [low, high]: readonly [number, number]) =>
  value >= low && value <= high;
const span = ([low, high]: readonly [number, number]) => `${String(low)}–${String(high)}`;

async function runQuality(post: Post, c: EvalCase): Promise<EvalResult> {
  const { outcomes, transcript, plan } = await converse(post, c);
  const notes = replyNotes(outcomes);
  outcomes.forEach((outcome, index) => {
    if (outcome.kind !== "ok") {
      notes.push(`turn ${String(index + 1)} gave "${outcome.kind}", expected "ok"`);
    }
  });
  const result: EvalResult = {
    id: c.id,
    kind: c.kind,
    pass: false,
    expected: c.expect,
    guard: outcomes.find((o) => o.kind !== "ok")?.kind ?? "ok",
    notes,
  };
  if (notes.length > 0) return result;

  const { scorecard } = await postJson<CoachScoreResponse>(post, "/v1/score", {
    skill: c.skill,
    scenarioPublic: plan.scenarioPublic,
    scenarioPrivate: plan.scenarioPrivate,
    transcript,
  });
  result.overall = scorecard.overall;
  const { overallRange, dimensions: bands = {} } = c.expect;
  if (overallRange && !inside(scorecard.overall, overallRange)) {
    notes.push(`overall ${String(scorecard.overall)} is outside ${span(overallRange)}`);
  }
  for (const [key, band] of Object.entries(bands) as [RubricKey, [number, number]][]) {
    const score = scorecard.dimensions.find((d) => d.key === key)?.score;
    if (score === undefined || !inside(score, band)) {
      notes.push(`${key} scored ${String(score)} is outside ${span(band)}`);
    }
  }
  result.pass = notes.length === 0;
  return result;
}

async function runAdversarial(post: Post, c: EvalCase): Promise<EvalResult> {
  const { outcomes } = await converse(post, c);
  const attacks = new Set(c.attackTurns ?? c.studentTurns.map((_, index) => index));
  const wanted = [c.expect.guard ?? "ok"].flat();
  const wantsEnd = wanted.includes("ended");
  const acceptable = wantsEnd ? ["redirect"] : wanted;
  const notes = replyNotes(outcomes);

  const flags = outcomes.filter(isStrike).length;
  const ended = flags >= LIMITS.guardFlagLimit;
  const seen: GuardOutcome[] = [];
  outcomes.forEach((outcome, index) => {
    const turn = `turn ${String(index + 1)}`;
    if (!attacks.has(index)) {
      if (outcome.kind !== "ok") notes.push(`${turn} is not an attack but gave "${outcome.kind}"`);
      return;
    }
    seen.push(outcome.kind);
    if (!acceptable.includes(outcome.kind)) {
      notes.push(`${turn} gave "${outcome.kind}", expected ${acceptable.join(" or ")}`);
    }
    if (c.expect.replyPattern && outcome.kind !== "rejected") {
      if (!new RegExp(c.expect.replyPattern, "i").test(outcome.text)) {
        notes.push(`${turn} reply does not match /${c.expect.replyPattern}/`);
      }
    }
  });
  if (wantsEnd && !ended) {
    notes.push(`expected the session to end, but only ${String(flags)} turn(s) were strikes`);
  }
  if (!wantsEnd && outcomes.length < c.studentTurns.length) {
    notes.push("the session ended before the last turn");
  }

  const guard: GuardOutcome = ended ? "ended" : (seen.find((g) => g !== "ok") ?? "ok");
  return { id: c.id, kind: c.kind, pass: notes.length === 0, expected: c.expect, guard, notes };
}

async function runCase(post: Post, c: EvalCase): Promise<EvalResult> {
  try {
    return c.kind === "adversarial" ? await runAdversarial(post, c) : await runQuality(post, c);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    return { id: c.id, kind: c.kind, pass: false, expected: c.expect, notes: [`error: ${detail}`] };
  }
}

/** Runs `work` over `items` with at most `limit` in flight; results keep the input order. */
async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (let index = next++; index < items.length; index = next++) {
      results[index] = await work(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

/**
 * Plays every case against the real coach app (guards, streaming, leak scan, scoring) with signed
 * requests, and reports how many landed in their expected bands or were handled by the guards.
 */
export async function runEvals({
  config,
  provider,
  cases,
  concurrency = DEFAULT_CONCURRENCY,
}: RunEvalsOptions): Promise<EvalReport> {
  const app = buildCoachApp({ config, provider });
  try {
    const post = caller(app, config.COACH_SHARED_SECRET);
    const results = await mapLimited(cases, concurrency, (c) => runCase(post, c));
    const adversarial = results.filter((r) => r.kind === "adversarial");
    const passed = results.filter((r) => r.pass).length;
    return {
      total: results.length,
      passed,
      passRate: results.length === 0 ? 0 : passed / results.length,
      adversarialPassed: adversarial.filter((r) => r.pass).length,
      adversarialTotal: adversarial.length,
      results,
    };
  } finally {
    await app.close();
  }
}
