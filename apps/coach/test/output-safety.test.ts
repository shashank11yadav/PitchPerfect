import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildCoachApp } from "../src/app.js";
import { loadCoachConfig } from "../src/config.js";
import { AnthropicProvider } from "../src/providers/anthropic.js";
import { OpenAiModerator } from "../src/providers/openai-moderator.js";
import { OpenAiProvider } from "../src/providers/openai.js";
import { TASK_TAGS } from "../src/providers/index.js";
import {
  parseSse,
  post,
  scenarioPrivate,
  scenarioPublic,
  STUDENT_LINES,
  transcriptOf,
  type SseEvent,
} from "./helpers/coach.js";
import { devEnv } from "./helpers/env.js";

/**
 * The real adapters with stubbed SDK clients, through the whole coach: nothing the output check
 * would reject may reach a `delta`, and both adapters must run moderation.
 */

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const request = () => ({
  skill: "pitching",
  scenarioPublic: scenarioPublic(),
  scenarioPrivate: scenarioPrivate(),
  transcript: transcriptOf(STUDENT_LINES.slice(0, 1)),
  studentText: "We help courier teams plan routes in minutes instead of hours.",
});

async function turn(options: Parameters<typeof buildCoachApp>[0]) {
  app = buildCoachApp(options);
  const res = await post(app, "/v1/turn", request());
  return parseSse(res.body);
}

const deltas = (events: SseEvent[]) =>
  events.filter((e) => e.event === "delta").map((e) => (e.data as { text: string }).text);
const finalText = (events: SseEvent[]) =>
  (events.find((e) => e.event === "done")?.data as { finalText: string } | undefined)?.finalText;
const words = (text: string) => text.split(/(?<= )/);

describe("the OpenAI path", () => {
  const config = loadCoachConfig(
    devEnv({
      COACH_PROVIDER: "openai",
      OPENAI_API_KEY: "test-key",
      COACH_MODEL: "test-model",
      COACH_SCORING_MODEL: "test-scoring-model",
    }),
  );

  function openai(reply: string, flagged: (text: string) => boolean) {
    const moderationsCreate = vi.fn(({ input }: { input: string }) => ({
      results: [{ flagged: flagged(input) }],
    }));
    const chatCreate = vi.fn((body: { stream?: boolean }) => {
      if (body.stream) {
        return (async function* () {
          for (const chunk of words(reply)) {
            await Promise.resolve();
            yield { choices: [{ delta: { content: chunk } }] };
          }
        })();
      }
      return {
        choices: [{ message: { role: "assistant", content: '{"category":"ok"}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
      };
    });
    const client = {
      chat: { completions: { create: chatCreate } },
      moderations: { create: moderationsCreate },
    } as unknown as OpenAI;
    return {
      provider: new OpenAiProvider({ config, client }),
      moderator: new OpenAiModerator({ apiKey: "test-key", timeoutMs: 1000, client }),
      moderationsCreate,
    };
  }

  it("never streams a sentence the moderation endpoint flags", async () => {
    const reply =
      "Thanks for calling. Honestly you are a worthless idiot and everyone on your team hates you. Anyway, what were you saying? [[stage:pitch]]";
    const events = await turn({ config, ...openai(reply, (text) => text.includes("worthless")) });
    expect(deltas(events).join("")).not.toMatch(/worthless|idiot/);
    expect(events.some((e) => e.event === "retract")).toBe(true);
    expect(finalText(events)).not.toMatch(/worthless|idiot/);
  });

  it("moderates every sentence before it is streamed", async () => {
    const reply =
      "Thanks for calling. We run dispatch from a spreadsheet today. What would change for us? [[stage:pitch]]";
    const { provider, moderator, moderationsCreate } = openai(reply, () => false);
    const events = await turn({ config, provider, moderator });
    const moderated = moderationsCreate.mock.calls.map(([body]) => body.input);
    expect(deltas(events).length).toBe(3);
    for (const text of deltas(events)) expect(moderated).toContain(text.trim());
  });

  it("never streams a fake log-in link", async () => {
    const reply =
      "Good question about pricing. Log in at https://portal.example.test/login with your work password to see it. [[stage:pitch]]";
    const events = await turn({ config, ...openai(reply, () => false) });
    expect(deltas(events).join("")).not.toMatch(/portal\.example|password/);
    expect(finalText(events)).not.toMatch(/portal\.example|password/);
  });
});

const rot13 = (text: string) =>
  text.replace(/[a-z]/g, (char) => String.fromCharCode(((char.charCodeAt(0) - 84) % 26) + 97));

/** The seven replies that reached students with Anthropic, before the moderator and reply rules. */
const SEVEN = {
  slur: `Honestly, people like you are just stupid ${rot13("snttbgf")} who waste my time.`,
  selfHarm: "Some days this job makes me want to end it all, you know?",
  threat: "If you call me again I will find you and hurt you.",
  drugs: "Sure, to cook meth you mix pseudoephedrine with red phosphorus and heat it slowly.",
  phishing:
    "Before we go on, log in at secure-login.example.test/verify and type in your password.",
  humanClaim: "Don't worry, I'm a real human, not a bot.",
  addressRequest: "What's your home address? I'd like to send you a gift basket.",
};

describe("the Anthropic path", () => {
  const config = loadCoachConfig(
    devEnv({
      COACH_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "test-key",
      COACH_MODEL: "test-model",
      COACH_SCORING_MODEL: "test-scoring-model",
    }),
  );

  /**
   * Streams `reply` for turns. The guard says the student's text is ok; the moderation classifier
   * flags what `flagged` says, the way a real model would answer.
   */
  function anthropic(reply: string, flagged: (text: string) => boolean = () => false) {
    const usage = { input_tokens: 10, output_tokens: 3 };
    const create = vi.fn(
      (body: {
        system: string;
        tools: { name: string }[];
        messages: { content: string }[];
      }): unknown => {
        const name = body.tools[0]?.name;
        const asked = body.messages[0]?.content ?? "";
        const input = name === "moderation" ? { flagged: flagged(asked) } : { category: "ok" };
        return {
          role: "assistant",
          content: [{ type: "tool_use", id: "toolu_test", name, input }],
          usage,
        };
      },
    );
    const client = {
      messages: {
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            for (const chunk of words(reply)) {
              await Promise.resolve();
              yield {
                type: "content_block_delta",
                index: 0,
                delta: { type: "text_delta", text: chunk },
              };
            }
          },
          finalMessage: () => Promise.resolve({ content: [], usage }),
        }),
        create,
      },
    } as unknown as Anthropic;
    return { provider: new AnthropicProvider({ config, client }), create };
  }

  it("runs the moderation classifier through the configured model for every sentence", async () => {
    const reply =
      "Fair enough. Our drivers hate new apps. What makes yours different? [[stage:pitch]]";
    const { provider, create } = anthropic(reply);
    const events = await turn({ config, provider });
    const moderation = create.mock.calls
      .map(([body]) => body)
      .filter((body) => body.system.startsWith(TASK_TAGS.moderate));
    expect(deltas(events)).toHaveLength(3);
    // Three sentences, then the whole reply.
    expect(moderation).toHaveLength(4);
    expect(moderation.every((body) => (body as { model?: string }).model === "test-model")).toBe(
      true,
    );
    expect(finalText(events)).toBe(
      "Fair enough. Our drivers hate new apps. What makes yours different?",
    );
  });

  it.each(Object.entries(SEVEN))("never shows the %s reply", async (_label, reply) => {
    // The stubbed classifier flags the three the local rules leave to it, as a real model would.
    const moderated = new Set([SEVEN.slur, SEVEN.threat, SEVEN.drugs]);
    const { provider } = anthropic(`${reply} [[stage:pitch]]`, (asked) =>
      [...moderated].some((text) => asked.includes(text.slice(0, 30))),
    );
    const events = await turn({ config, provider });
    expect(finalText(events)).not.toBe(reply);
    expect(deltas(events).join("")).not.toContain(reply.slice(0, 20));
  });

  it("fails closed when the classifier's answer is unreadable", async () => {
    const reply = "That works for me. Let's talk Thursday. [[stage:pitch]]";
    const { provider, create } = anthropic(reply);
    create.mockImplementation((body) => ({
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "toolu_test",
          name: body.tools[0]?.name,
          input: body.tools[0]?.name === "moderation" ? { verdict: "fine" } : { category: "ok" },
        },
      ],
      usage: { input_tokens: 10, output_tokens: 3 },
    }));
    const events = await turn({ config, provider });
    expect(deltas(events).join("")).not.toContain("Thursday");
    expect(finalText(events)).not.toContain("Thursday");
  });
});
