import {
  CoachPlanResponseSchema,
  CoachScoreResponseSchema,
  CoachTurnEvent,
  type CoachPlanRequest,
  type CoachPlanResponse,
  type CoachScoreRequest,
  type CoachScoreResponse,
  type CoachTurnRequest,
} from "@pitchperfect/shared";
import { signRequest } from "@pitchperfect/shared/hmac";
import type { ZodType } from "zod";
import type { Config } from "../config.js";
import { AppError, PracticeUnavailableError, UpstreamError } from "../errors.js";

export type HealthStatus = "ok" | "down";

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
  health(): Promise<HealthStatus>;
  plan(req: CoachPlanRequest, signal?: AbortSignal): Promise<CoachPlanResponse>;
  turn(req: CoachTurnRequest, signal: AbortSignal): AsyncIterable<CoachTurnEvent>;
  score(req: CoachScoreRequest, signal?: AbortSignal): Promise<CoachScoreResponse>;
}

const HEALTH_TIMEOUT_MS = 2000;
/** Above the coach's own 30 s provider timeout, so the coach reports its failures itself. */
const CALL_TIMEOUT_MS = 35_000;

function errorCodeOf(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("error" in body)) return undefined;
  const { error } = body;
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

async function failureOf(res: Response): Promise<Error> {
  const code = errorCodeOf(await res.json().catch(() => null));
  if (res.status === 503 && code === "practice_unavailable") return new PracticeUnavailableError();
  if (res.status === 400 && code === "not_enough_turns") return new NotEnoughTurnsError();
  return new UpstreamError();
}

/** The caller's abort passes through untouched; everything else becomes `UpstreamError`. */
function normalize(error: unknown, signal: AbortSignal | undefined): unknown {
  if (signal?.aborted) return signal.reason;
  return error instanceof AppError ? error : new UpstreamError();
}

function parseFrame(frame: string): CoachTurnEvent | null {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");
  // Heartbeat comments and empty frames carry no data.
  if (data === "") return null;
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
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let end = buffer.indexOf("\n\n");
    while (end !== -1) {
      const event = parseFrame(buffer.slice(0, end));
      buffer = buffer.slice(end + 2);
      if (event) yield event;
      end = buffer.indexOf("\n\n");
    }
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
        return res.ok ? "ok" : "down";
      } catch {
        return "down";
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
