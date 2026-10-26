import type { IncomingMessage } from "node:http";
import type { Express } from "express";
import type { DestinationStream } from "pino";
import request from "supertest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { PracticeEvent, type CoachTurnEvent, type CoachTurnRequest } from "@pitchperfect/shared";
import { User } from "../../src/db/models/index.js";
import { createHttpCoachClient, type CoachClient } from "../../src/services/coach-client.js";
import { makeTestApp } from "./app.js";
import type { CsrfAgent } from "./csrf.js";
import { devEnv } from "./env.js";
import { createStudent, signIn } from "./factories.js";
import { startStubCoach, type StubCoach } from "./stub-coach.js";

/** How a scripted turn breaks off after its first delta. */
type Interruption = "stall" | "error";

function aborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    signal.addEventListener("abort", () => {
      resolve();
    });
  });
}

/**
 * The real HTTP coach client. `interrupt` makes the next turns break off after their first delta:
 * `stall` holds the stream open until the caller aborts (a browser leaving mid-reply), `error`
 * ends it with a coach `error` event.
 */
class StallableCoach implements CoachClient {
  interrupt: Interruption | null = null;

  constructor(private readonly inner: CoachClient) {}

  health() {
    return this.inner.health();
  }

  plan(...args: Parameters<CoachClient["plan"]>) {
    return this.inner.plan(...args);
  }

  score(...args: Parameters<CoachClient["score"]>) {
    return this.inner.score(...args);
  }

  async *turn(req: CoachTurnRequest, signal: AbortSignal): AsyncIterable<CoachTurnEvent> {
    for await (const event of this.inner.turn(req, signal)) {
      yield event;
      if (event.type !== "delta" || !this.interrupt) continue;
      if (this.interrupt === "error") {
        yield { type: "error", code: "upstream_error" };
        return;
      }
      // A stalled coach sends nothing after the caller leaves, not even events it already buffered.
      await aborted(signal);
      return;
    }
  }
}

/** A promise and the function that settles it, to hold a step until the test lets it go. */
export function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

interface PracticeHarness {
  app: Express;
  stub: StubCoach;
  coach: StallableCoach;
}

/** Starts an in-process coach and an api app wired to it for the whole test file. */
export function usePracticeHarness(
  options: { logStream?: DestinationStream; env?: NodeJS.ProcessEnv } = {},
) {
  const harness = {} as PracticeHarness;
  beforeAll(async () => {
    const secret = devEnv().COACH_SHARED_SECRET ?? "";
    harness.stub = await startStubCoach(secret);
    harness.coach = new StallableCoach(
      createHttpCoachClient({ COACH_URL: harness.stub.url, COACH_SHARED_SECRET: secret }),
    );
    harness.app = makeTestApp({
      env: { ...options.env, COACH_URL: harness.stub.url },
      coach: harness.coach,
      logStream: options.logStream,
    }).app;
  });
  afterEach(() => {
    harness.stub.clear();
    harness.coach.interrupt = null;
  });
  afterAll(async () => {
    await harness.stub.close();
  });
  return harness;
}

/** A signed-in student who has (by default) accepted the practice notice. */
export async function practiceStudent(
  app: Express,
  options: { consent?: boolean; verified?: boolean } = {},
) {
  const student = await createStudent({ verified: options.verified });
  if (options.consent !== false) {
    await User.updateOne({ _id: student.user._id }, { practiceConsentAt: new Date() });
  }
  const session = await signIn(request.agent(app), student.email, student.password);
  return { ...student, session };
}

export interface StreamEvent {
  event: string;
  data: Record<string, unknown>;
}

/**
 * Parses `event:`/`data:` frames from an SSE body (comment lines are skipped) and checks each one
 * against the shared `PracticeEvent` contract.
 */
function parseEvents(body: string): StreamEvent[] {
  return body
    .split("\n\n")
    .filter((frame) => frame.trim() !== "" && !frame.startsWith(":"))
    .map((frame) => {
      const lines = frame.split("\n");
      const event = lines.find((line) => line.startsWith("event: "))?.slice(7) ?? "";
      const data = lines.find((line) => line.startsWith("data: "))?.slice(6) ?? "null";
      const parsed = JSON.parse(data) as Record<string, unknown>;
      PracticeEvent.parse({ ...parsed, type: event });
      return { event, data: parsed };
    });
}

export const sessionsPath = "/api/practice/sessions";

/** `POST /api/practice/sessions`; returns the response and the new attempt id (if any). */
export async function startPractice(session: CsrfAgent, body: object = { skill: "pitching" }) {
  const res = await session.post(sessionsPath).send(body);
  return { res, attemptId: (res.body as { attemptId?: string }).attemptId ?? "" };
}

/** One student turn; resolves when the stream ends. */
export async function sendTurn(session: CsrfAgent, attemptId: string, text: string) {
  const res = await session.post(`${sessionsPath}/${attemptId}/turns`).send({ text });
  return { res, events: res.status === 200 ? parseEvents(res.text) : [] };
}

const STUDENT_LINES = [
  "Hi, thanks for taking my call. I work with teams like yours on delivery planning.",
  "How do you plan routes today, and what happens when a driver calls in sick?",
  "That sounds painful. Teams like yours cut planning time by a third. Could we meet Tuesday?",
] as const;

/** Sends `count` ordinary turns, each expected to finish with `done`. */
export async function sendTurns(session: CsrfAgent, attemptId: string, count: number) {
  for (let index = 0; index < count; index += 1) {
    const line = STUDENT_LINES[index % STUDENT_LINES.length] ?? STUDENT_LINES[0];
    const { events } = await sendTurn(session, attemptId, line);
    if (!events.some((event) => event.event === "done")) {
      throw new Error(`turn ${String(index + 1)} did not finish: ${JSON.stringify(events)}`);
    }
  }
}

/**
 * Sends a turn and hangs up once the first `delta` has arrived (after `whileStreaming`, if given,
 * has finished). Resolves with the events received before hanging up.
 */
export async function sendTurnAndLeave(
  session: CsrfAgent,
  attemptId: string,
  text: string,
  whileStreaming: () => Promise<void> = () => Promise.resolve(),
) {
  const res = await session
    .post(`${sessionsPath}/${attemptId}/turns`)
    .send({ text })
    .buffer(true)
    .parse((response, callback) => {
      const stream = response as unknown as IncomingMessage;
      let body = "";
      let leaving = false;
      stream.setEncoding("utf8");
      stream.on("data", (chunk: string) => {
        body += chunk;
        if (leaving || !body.includes("event: delta")) return;
        leaving = true;
        void whileStreaming().then(() => {
          callback(null, body);
          stream.destroy();
        });
      });
      stream.on("end", () => {
        if (!leaving) callback(null, body);
      });
    });
  return parseEvents(res.body as string);
}
