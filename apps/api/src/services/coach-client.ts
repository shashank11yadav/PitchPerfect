import {
  CoachErrorBodySchema,
  CoachPlanResponseSchema,
  CoachScoreResponseSchema,
  CoachTurnEvent,
  readSseMessages,
  type CoachPlanRequest,
  type CoachPlanResponse,
  type CoachScoreRequest,
  type CoachScoreResponse,
  type CoachTurnRequest,
  type Usage,
} from "@pitchperfect/shared";
import { signRequest } from "@pitchperfect/shared/hmac";
import type { ZodType } from "zod";
import type { Config } from "../config.js";
import { AppError, PracticeUnavailableError, UpstreamError } from "../errors.js";

export type HealthStatus = "ok" | "down";

/** What the coach's unsigned `GET /healthz` says: up or not, and which provider it runs. */
export interface CoachHealth {
  status: HealthStatus;
  /** The coach's `COACH_PROVIDER` (`fake`, `openai`, `anthropic`); unknown when it is down. */
  provider: string | undefined;
}

/** The coach found no student text worth scoring (`400 not_enough_turns`). */
export class NotEnoughTurnsError extends Error {
  constructor() {
    super("The coach found nothing to score");
    this.name = "NotEnoughTurnsError";
  }
}

/**
 * The api's view of the coach service. Practice calls reject with `PracticeUnavailableError` (the
 * coach's circuit is open), `NotEnoughTurnsError` (score only), `UpstreamError` (anything else),
 * or, when the caller's signal aborts, with that signal's reason.
 */
export interface CoachClient {
  health(): Promise<CoachHealth>;
  plan(req: CoachPlanRequest, signal?: AbortSignal): Promise<CoachPlanResponse>;
  turn(req: CoachTurnRequest, signal: AbortSignal): AsyncIterable<CoachTurnEvent>;
  score(req: CoachScoreRequest, signal?: AbortSignal): Promise<CoachScoreResponse>;
}

const HEALTH_TIMEOUT_MS = 2000;
/** Above the coach's own 30 s provider timeout, so the coach reports its failures itself. */
const CALL_TIMEOUT_MS = 35_000;

const DOWN: CoachHealth = { status: "down", provider: undefined };

function providerOf(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("provider" in body)) return undefined;
  return typeof body.provider === "string" ? body.provider : undefined;
}

type TokenUsage = Pick<Usage, "inputTokens" | "outputTokens">;

const NO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0 };

/** What each failed call cost, when the coach's answer says; see `usageOfFailure`. */
const failureUsage = new WeakMap<Error, TokenUsage>();

/**
 * What a failed coach call used: the usage the coach reported with its error, or nothing for a
 * call it turned away (a 4xx, or 503 with nothing spent). Undefined when it isn't known (no
 * answer, a timeout, or a 5xx that names no usage): the caller charges an estimate then.
 */
export function usageOfFailure(error: unknown): TokenUsage | undefined {
  return error instanceof Error ? failureUsage.get(error) : undefined;
}

async function failureOf(res: Response): Promise<Error> {
  const parsed = CoachErrorBodySchema.safeParse(await res.json().catch(() => null));
  const code = parsed.data?.error.code;
  const error =
    res.status === 503 && code === "practice_unavailable"
      ? new PracticeUnavailableError()
      : res.status === 400 && code === "not_enough_turns"
        ? new NotEnoughTurnsError()
        : new UpstreamError();
  const usage = parsed.data?.usage ?? (res.status < 500 || res.status === 503 ? NO_USAGE : null);
  if (usage) failureUsage.set(error, usage);
  return error;
}

/** The caller's abort passes through untouched; everything else becomes `UpstreamError`. */
function normalize(error: unknown, signal: AbortSignal | undefined): unknown {
  if (signal?.aborted) return signal.reason;
  return error instanceof AppError ? error : new UpstreamError();
}

/** The event a frame's data carries; the coach puts the event type in the data too. */
function parseEvent(data: string): CoachTurnEvent {
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    throw new UpstreamError();
  }
  const event = CoachTurnEvent.safeParse(json);
  if (!event.success) throw new UpstreamError();
  return event.data;
}

/** Yields each `CoachTurnEvent` as soon as its frame is complete. */
async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<CoachTurnEvent> {
  for await (const { data } of readSseMessages(body)) {
    // Heartbeat comments carry no message, and an empty one carries nothing to read.
    if (data !== "") yield parseEvent(data);
  }
}

/**
 * Talks to the coach over HTTP. Every practice call is HMAC-signed over the exact body sent and
 * gives up after 35 s.
 */
export function createHttpCoachClient(
  config: Pick<Config, "COACH_URL" | "COACH_SHARED_SECRET">,
): CoachClient {
  async function post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    const payload = JSON.stringify(body);
    const headers = {
      "content-type": "application/json",
      ...signRequest(
        config.COACH_SHARED_SECRET,
        { method: "POST", path, body: payload },
        Date.now() / 1000,
      ),
    };
    const timeout = AbortSignal.timeout(CALL_TIMEOUT_MS);
    try {
      const res = await fetch(new URL(path, config.COACH_URL), {
        method: "POST",
        headers,
        body: payload,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (!res.ok) throw await failureOf(res);
      return res;
    } catch (error) {
      if (error instanceof NotEnoughTurnsError) throw error;
      throw normalize(error, signal);
    }
  }

  async function postJson<T>(
    path: string,
    body: unknown,
    schema: ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const res = await post(path, body, signal);
    let json: unknown;
    try {
      json = await res.json();
    } catch (error) {
      throw normalize(error, signal);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new UpstreamError();
    return parsed.data;
  }

  return {
    async health() {
      try {
        const res = await fetch(new URL("/healthz", config.COACH_URL), {
          signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        });
        if (!res.ok) return DOWN;
        return { status: "ok", provider: providerOf(await res.json().catch(() => null)) };
      } catch {
        return DOWN;
      }
    },
    plan: (req, signal) => postJson("/v1/plan", req, CoachPlanResponseSchema, signal),
    score: (req, signal) => postJson("/v1/score", req, CoachScoreResponseSchema, signal),
    async *turn(req, signal) {
      const res = await post("/v1/turn", req, signal);
      if (!res.body) throw new UpstreamError();
      try {
        yield* readEvents(res.body);
      } catch (error) {
        throw normalize(error, signal);
      }
    },
  };
}
