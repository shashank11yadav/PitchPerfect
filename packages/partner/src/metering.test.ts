import { LIMITS, type CoachTurnRequest } from "@pitchperfect/shared";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { createPracticeDeps } from "./deps.js";
import { FakeProvider } from "./fake/fake.js";
import { createModelModerator } from "./guardrails/moderator.js";
import { estimatedUsage, meteredProvider } from "./metering.js";
import { planScenario } from "./plan.js";
import {
  createUsageMeter,
  ProviderError,
  TASK_TAGS,
  type ChatStreamInput,
  type LlmProvider,
  type StructuredInput,
} from "./provider.js";
import { scoreTranscript } from "./score.js";
import { runTurn } from "./turn/run-turn.js";

const signal = () => new AbortController().signal;

const STREAM: ChatStreamInput = {
  system: `${TASK_TAGS.turn} You are a buyer.`,
  messages: [{ role: "user", content: "Hi, thanks for taking my call." }],
  maxTokens: 200,
  temperature: 0.8,
};

const STRUCTURED: StructuredInput<{ category: string }> = {
  system: `${TASK_TAGS.guard} Classify the line.`,
  messages: [{ role: "user", content: "How do you plan routes today?" }],
  maxTokens: 50,
  schema: z.object({ category: z.string() }),
  schemaName: "guard",
};

const REAL = { inputTokens: 11, outputTokens: 7 };

/** A chat stream that yields `chunks` and then reports `REAL`, or fails with `failure` instead. */
function scriptedStream(chunks: string[], failure?: ProviderError): LlmProvider["chatStream"] {
  return async function* (_input, _signal, meter) {
    for (const chunk of chunks) {
      await Promise.resolve();
      yield chunk;
    }
    await Promise.resolve();
    // Like the SDKs, usage comes only at the end of the stream.
    if (failure) throw failure;
    meter?.add(REAL);
  };
}

/** Reads a stream to its end, or stops after `limit` chunks. */
async function read(stream: AsyncIterable<string>, limit = Infinity): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
    if (chunks.length >= limit) break;
  }
  return chunks;
}

/** A live-named provider whose calls behave as each test says. */
function provider(parts: Partial<Pick<LlmProvider, "chatStream" | "structured">>): LlmProvider {
  return {
    name: "openai",
    chatStream: parts.chatStream ?? scriptedStream([]),
    structured: parts.structured ?? (() => Promise.reject(new Error("not used"))),
  };
}

describe("estimatedUsage", () => {
  it("charges the whole prompt at four characters a token and the full output cap", () => {
    const prompt = STREAM.system + STREAM.messages.map((message) => message.content).join("");
    expect(estimatedUsage(STREAM)).toEqual({
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: 200,
    });
  });
});

describe("meteredProvider", () => {
  it("adds only the provider's own figures when it reports them", async () => {
    const meter = createUsageMeter();
    const metered = meteredProvider(provider({ chatStream: scriptedStream(["Sure."]) }));
    expect(await read(metered.chatStream(STREAM, signal(), meter))).toEqual(["Sure."]);
    expect(meter.total()).toEqual(REAL);
  });

  it("estimates a stream that breaks off before the provider reports", async () => {
    const meter = createUsageMeter();
    const broken = scriptedStream(["Well, "], new ProviderError("upstream_unavailable"));
    const metered = meteredProvider(provider({ chatStream: broken }));
    await expect(read(metered.chatStream(STREAM, signal(), meter))).rejects.toThrow(ProviderError);
    expect(meter.total()).toEqual(estimatedUsage(STREAM));
  });

  it("estimates a stream the caller stopped early, as a blocked reply is", async () => {
    const meter = createUsageMeter();
    const metered = meteredProvider(
      provider({ chatStream: scriptedStream(["Visit ", "example.test"]) }),
    );
    expect(await read(metered.chatStream(STREAM, signal(), meter), 1)).toEqual(["Visit "]);
    expect(meter.total()).toEqual(estimatedUsage(STREAM));
  });

  it("estimates an aborted stream", async () => {
    const meter = createUsageMeter();
    const controller = new AbortController();
    const metered = meteredProvider(new FakeProvider());
    const stream = metered.chatStream(STREAM, controller.signal, meter)[Symbol.asyncIterator]();
    await stream.next();
    controller.abort();
    await expect(read({ [Symbol.asyncIterator]: () => stream })).rejects.toMatchObject({
      code: "aborted",
    });
    expect(meter.total()).toEqual(estimatedUsage(STREAM));
  });

  it("estimates a structured call that timed out", async () => {
    const meter = createUsageMeter();
    const metered = meteredProvider(
      provider({ structured: () => Promise.reject(new ProviderError("timeout")) }),
    );
    await expect(metered.structured(STRUCTURED, signal(), meter)).rejects.toThrow(ProviderError);
    expect(meter.total()).toEqual(estimatedUsage(STRUCTURED));
  });

  it("charges nothing for a call the provider refused", async () => {
    for (const code of ["rate_limited", "request_rejected", "practice_unavailable"] as const) {
      const meter = createUsageMeter();
      const metered = meteredProvider(
        provider({ structured: () => Promise.reject(new ProviderError(code)) }),
      );
      await expect(metered.structured(STRUCTURED, signal(), meter)).rejects.toThrow(ProviderError);
      expect(meter.total(), code).toEqual({ inputTokens: 0, outputTokens: 0 });
    }
  });

  it("keeps the real figures of a call whose output then failed validation", async () => {
    const meter = createUsageMeter();
    const metered = meteredProvider(
      provider({
        structured(_input, _signal, inner) {
          inner?.add(REAL);
          return Promise.reject(new ProviderError("invalid_structured_output"));
        },
      }),
    );
    await expect(metered.structured(STRUCTURED, signal(), meter)).rejects.toThrow(ProviderError);
    expect(meter.total()).toEqual(REAL);
  });
});

describe("what a session's steps charge", () => {
  it("charges the failed attempt before a retry as well as the retry", async () => {
    let calls = 0;
    const flaky = provider({
      structured(input, signal, inner) {
        calls += 1;
        if (calls === 1) return Promise.reject(new ProviderError("upstream_unavailable"));
        return new FakeProvider().structured(input, signal, inner);
      },
    });
    const meter = createUsageMeter();
    const plan = await planScenario(
      createPracticeDeps({ COACH_TIMEOUT_MS: 5_000 }, flaky),
      { skill: "pitching" },
      signal(),
      { meter },
    );
    expect(calls).toBe(2);
    expect(plan.usage.outputTokens).toBeGreaterThanOrEqual(LIMITS.maxTokensPlan);
    expect(plan.usage).toMatchObject(meter.total());
  });

  it("reports what a failed score used through the caller's meter", async () => {
    const failing = provider({
      structured: () => Promise.reject(new ProviderError("upstream_unavailable")),
    });
    const fake = new FakeProvider();
    const plan = await planScenario(
      createPracticeDeps({ COACH_TIMEOUT_MS: 5_000 }, fake),
      { skill: "pitching" },
      signal(),
    );
    const meter = createUsageMeter();
    await expect(
      scoreTranscript(
        createPracticeDeps({ COACH_TIMEOUT_MS: 5_000 }, failing),
        {
          skill: "pitching",
          scenarioPublic: plan.scenarioPublic,
          scenarioPrivate: plan.scenarioPrivate,
          transcript: [{ role: "student", text: "How do you plan routes today?" }],
        },
        signal(),
        meter,
      ),
    ).rejects.toThrow(ProviderError);
    // The first call and its one retry.
    expect(meter.total().outputTokens).toBe(2 * LIMITS.maxTokensScore);
  });

  it("charges a moderation check that timed out, through the classifier", async () => {
    const fake = new FakeProvider({ overrides: { turn: () => "Fair point. [[stage:pitch]]" } });
    const slowModeration = provider({
      chatStream: fake.chatStream.bind(fake),
      structured(input, signal, inner) {
        if (input.system.startsWith(TASK_TAGS.moderate)) {
          return Promise.reject(new ProviderError("timeout"));
        }
        return fake.structured(input, signal, inner);
      },
    });
    const deps = createPracticeDeps(
      { COACH_TIMEOUT_MS: 5_000 },
      slowModeration,
      createModelModerator(slowModeration),
    );
    const plan = await planScenario(deps, { skill: "pitching" }, signal());
    const turn: CoachTurnRequest = {
      skill: "pitching",
      scenarioPublic: plan.scenarioPublic,
      scenarioPrivate: plan.scenarioPrivate,
      transcript: [],
      studentText: "We help teams plan routes in minutes.",
    };
    const meter = createUsageMeter();
    const { outcome } = await runTurn(turn, {
      deps,
      signal: signal(),
      meter,
      sink: { send: () => Promise.resolve() },
    });
    expect(outcome).toBe("fallback");
    // The classifier's timed-out call is charged its full output cap.
    expect(meter.total().outputTokens).toBeGreaterThanOrEqual(LIMITS.maxTokensModeration);
  });
});
