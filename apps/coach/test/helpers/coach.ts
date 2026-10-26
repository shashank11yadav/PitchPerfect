import type { ScenarioPrivate, ScenarioPublic, TranscriptEntry } from "@pitchperfect/shared";
import { signRequest } from "@pitchperfect/shared/hmac";
import type { FastifyInstance } from "fastify";
import { buildCoachApp } from "../../src/app.js";
import { loadCoachConfig } from "../../src/config.js";
import { FakeProvider, type LlmProvider, type Moderator } from "../../src/providers/index.js";
import { devEnv } from "./env.js";

const config = loadCoachConfig(devEnv());

/** The coach with the scripted provider by default and no moderator unless one is given. */
export function buildApp(
  provider: LlmProvider = new FakeProvider(),
  moderator?: Moderator,
): FastifyInstance {
  return buildCoachApp({ config, provider, ...(moderator && { moderator }) });
}

/** A moderator that flags whatever `flagged` says, and records what it was asked. */
export function stubModerator(flagged: (text: string) => boolean | Promise<boolean> = () => false) {
  const seen: string[] = [];
  const moderator: Moderator & { seen: string[] } = {
    name: "openai",
    seen,
    async moderate(text) {
      seen.push(text);
      return { flagged: await flagged(text) };
    },
  };
  return moderator;
}

export function signedHeaders(path: string, payload: string): Record<string, string> {
  return {
    "content-type": "application/json",
    ...signRequest(
      config.COACH_SHARED_SECRET,
      { method: "POST", path, body: payload },
      Math.floor(Date.now() / 1000),
    ),
  };
}

/** A signed JSON POST, the way the api calls the coach. */
export function post(app: FastifyInstance, path: string, body: unknown) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return app.inject({ method: "POST", url: path, headers: signedHeaders(path, payload), payload });
}

export interface SseEvent {
  event: string;
  data: unknown;
}

/** Parses `event:`/`data:` frames; comment lines (heartbeats) are skipped. */
export function parseSse(body: string): SseEvent[] {
  return body
    .split("\n\n")
    .filter((frame) => frame.trim() !== "" && !frame.startsWith(":"))
    .map((frame) => {
      const lines = frame.split("\n");
      const event = lines.find((line) => line.startsWith("event: "))?.slice(7) ?? "";
      const data = lines.find((line) => line.startsWith("data: "))?.slice(6) ?? "null";
      return { event, data: JSON.parse(data) as unknown };
    });
}

export const scenarioPublic = (): ScenarioPublic => ({
  personaName: "Priya Natarajan",
  personaTitle: "Operations manager",
  companyType: "A 60-person regional courier company",
  personality: "Busy, direct, skeptical of hype",
  openingLine: "Hi, Priya here. I have about five minutes. What did you want to talk about?",
});

export const scenarioPrivate = (): ScenarioPrivate => ({
  hiddenObjections: [
    "We signed a two-year deal with another vendor last spring.",
    "My drivers hate learning new apps.",
  ],
  winConditions: ["The student asks how dispatch works today before pitching."],
});

export const STUDENT_LINES = [
  "Hi Priya, thanks for taking the call. I'm Jordan from a routing software startup.",
  "How do you plan delivery routes today? What happens when a driver calls in sick?",
  "Fair point. Teams like yours cut planning time by 30 percent. Could we meet Tuesday at 10am?",
] as const;

/** Alternating partner/student entries, starting with the persona's opening line. */
export function transcriptOf(studentLines: readonly string[]): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [{ role: "partner", text: scenarioPublic().openingLine }];
  studentLines.forEach((text, index) => {
    entries.push({ role: "student", text });
    if (index < studentLines.length - 1) {
      entries.push({ role: "partner", text: "Go on, I'm listening." });
    }
  });
  return entries;
}
