import { ScenarioPrivateSchema, ScenarioPublicSchema, ScorecardSchema } from "@pitchperfect/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  type ChatMessage,
  createUsageMeter,
  FakeProvider,
  ProviderError,
  stageTag,
  TASK_TAGS,
  type UsageMeter,
} from "./index.js";

const PlanSchema = z.strictObject({
  scenarioPublic: ScenarioPublicSchema,
  scenarioPrivate: ScenarioPrivateSchema,
});
const GuardSchema = z.strictObject({
  category: z.enum(["ok", "off_topic", "prompt_attack", "harmful"]),
});

const signal = () => new AbortController().signal;

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

/** Builds a conversation with `count` student turns, partner replies in between. */
function conversation(studentTurns: readonly string[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  studentTurns.forEach((turn, index) => {
    if (index > 0) messages.push({ role: "assistant", content: "Go on." });
    messages.push({ role: "user", content: `<student_turn>${turn}</student_turn>` });
  });
  return messages;
}

function turn(
  provider: FakeProvider,
  studentTurns: readonly string[],
  abortSignal = signal(),
  meter?: UsageMeter,
) {
  return provider.chatStream(
    {
      system: `${TASK_TAGS.turn} You are a buyer.`,
      messages: conversation(studentTurns),
      maxTokens: 200,
      temperature: 0.7,
    },
    abortSignal,
    meter,
  );
}

/** Reads a stream, aborting the controller once `abortAt` chunks have arrived. */
async function readThenAbort(
  stream: AsyncIterable<string>,
  controller: AbortController,
  abortAt: number,
  reason?: unknown,
) {
  const received: string[] = [];
  for await (const chunk of stream) {
    received.push(chunk);
    if (received.length === abortAt) controller.abort(reason);
  }
}

const plan = (provider: FakeProvider) =>
  provider.structured(
    {
      system: `${TASK_TAGS.plan} Build a scenario.`,
      messages: [{ role: "user", content: "skill: pitching" }],
      maxTokens: 600,
      schema: PlanSchema,
      schemaName: "scenario",
    },
    signal(),
  );

const STUDENT_TURNS = [
  "Hi, I'm Sam. I help small clinics cut their scheduling time.",
  "What does your current booking process look like? How many hours a week does it take?",
  "That makes sense, I hear you on price. Teams like yours usually save four hours a week.",
  "Could we book a demo next Tuesday at 2pm with your operations lead?",
];

function score(provider: FakeProvider, studentTurns: readonly string[] = STUDENT_TURNS) {
  const transcript = studentTurns
    .map((text) => `<student_turn>${text}</student_turn>\n<partner_turn>Okay.</partner_turn>`)
    .join("\n");
  return provider.structured(
    {
      system: `${TASK_TAGS.score} Score the transcript for the skill next-steps.`,
      messages: [{ role: "user", content: transcript }],
      maxTokens: 1200,
      schema: ScorecardSchema,
      schemaName: "scorecard",
    },
    signal(),
  );
}

describe("FakeProvider", () => {
  it("is named fake", () => {
    expect(new FakeProvider().name).toBe("fake");
  });

  describe("plan", () => {
    it("returns a valid scenario with 2-3 hidden objections", async () => {
      const result = await plan(new FakeProvider({ seed: 1 }));
      expect(PlanSchema.parse(result)).toEqual(result);
      expect(result.scenarioPrivate.hiddenObjections.length).toBeGreaterThanOrEqual(2);
      expect(result.scenarioPrivate.hiddenObjections.length).toBeLessThanOrEqual(3);
    });

    it("is identical across two runs with the same seed", async () => {
      expect(await plan(new FakeProvider({ seed: 42 }))).toEqual(
        await plan(new FakeProvider({ seed: 42 })),
      );
    });

    it("varies with the seed", async () => {
      const results = await Promise.all(
        [1, 2, 3, 4, 5].map((seed) => plan(new FakeProvider({ seed }))),
      );
      const names = new Set(results.map((result) => result.scenarioPublic.personaName));
      expect(names.size).toBeGreaterThan(1);
    });
  });

  describe("turn", () => {
    it("streams a reply in several chunks that ends with a stage tag", async () => {
      const chunks = await collect(turn(new FakeProvider(), ["Hello there."]));
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.join("").endsWith(` ${stageTag("discovery")}`)).toBe(true);
    });

    it("cycles through the stages and raises an objection at the third student turn", async () => {
      const provider = new FakeProvider({ seed: 3 });
      const stages: string[] = [];
      for (let count = 1; count <= 5; count += 1) {
        const text = (
          await collect(
            turn(
              provider,
              STUDENT_TURNS.slice(0, 1).concat(
                Array.from({ length: count - 1 }, (_, i) => `Turn ${String(i + 2)}.`),
              ),
            ),
          )
        ).join("");
        stages.push(/\[\[stage:(\w+)\]\]$/.exec(text)?.[1] ?? "none");
      }
      expect(stages).toEqual(["discovery", "pitch", "objection", "close", "opening"]);
    });

    it("is deterministic per seed and turn index", async () => {
      const first = (await collect(turn(new FakeProvider({ seed: 9 }), ["One.", "Two."]))).join("");
      const again = (await collect(turn(new FakeProvider({ seed: 9 }), ["Uno.", "Dos."]))).join("");
      expect(again).toBe(first);
    });

    it("keeps replies within 80 words", async () => {
      for (let seed = 0; seed < 10; seed += 1) {
        for (let count = 1; count <= 5; count += 1) {
          const turns = Array.from({ length: count }, () => "Tell me more.");
          const text = (await collect(turn(new FakeProvider({ seed }), turns))).join("");
          expect(text.split(/\s+/).length).toBeLessThanOrEqual(80);
        }
      }
    });

    it("meters usage into the call's meter", async () => {
      const meter = createUsageMeter();
      await collect(turn(new FakeProvider(), ["Hello there."], signal(), meter));
      expect(meter.total().inputTokens).toBeGreaterThan(0);
      expect(meter.total().outputTokens).toBeGreaterThan(0);
    });

    it("meters concurrent calls into their own meters", async () => {
      const provider = new FakeProvider();
      const [short, long] = [createUsageMeter(), createUsageMeter()];
      await Promise.all([
        collect(turn(provider, ["Hi."], signal(), short)),
        collect(turn(provider, ["Hi.", "A much longer second turn ".repeat(20)], signal(), long)),
      ]);
      expect(long.total().inputTokens).toBeGreaterThan(short.total().inputTokens);
      const alone = createUsageMeter();
      await collect(turn(provider, ["Hi."], signal(), alone));
      expect(short.total()).toEqual(alone.total());
    });

    it("rejects as aborted when aborted mid-stream", async () => {
      const controller = new AbortController();
      const stream = turn(new FakeProvider(), ["Hi."], controller.signal);
      await expect(readThenAbort(stream, controller, 1)).rejects.toMatchObject({
        code: "aborted",
      });
    });

    it("rejects as aborted when aborted after the last chunk", async () => {
      const chunks = await collect(turn(new FakeProvider(), ["Hi."]));
      const controller = new AbortController();
      const stream = turn(new FakeProvider(), ["Hi."], controller.signal);
      await expect(readThenAbort(stream, controller, chunks.length)).rejects.toMatchObject({
        code: "aborted",
      });
    });

    it("maps a timed-out signal to a retryable timeout", async () => {
      const controller = new AbortController();
      const stream = turn(new FakeProvider(), ["Hi."], controller.signal);
      const reason = new DOMException("The operation timed out.", "TimeoutError");
      await expect(readThenAbort(stream, controller, 1, reason)).rejects.toMatchObject({
        code: "timeout",
        retryable: true,
      });
    });

    it("stops with an aborted error when the signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();
      const stream = new FakeProvider().chatStream(
        {
          system: `${TASK_TAGS.turn} buyer`,
          messages: conversation(["Hi."]),
          maxTokens: 200,
          temperature: 0.7,
        },
        controller.signal,
      );
      await expect(collect(stream)).rejects.toMatchObject({ code: "aborted" });
    });
  });

  describe("score", () => {
    it("returns a scorecard that passes ScorecardSchema", async () => {
      const result = await score(new FakeProvider());
      expect(ScorecardSchema.safeParse(result).success).toBe(true);
    });

    it("quotes only verbatim student text as evidence", async () => {
      const result = await score(new FakeProvider());
      for (const dimension of result.dimensions) {
        if (dimension.evidence !== null) {
          expect(STUDENT_TURNS.some((text) => text.includes(dimension.evidence ?? ""))).toBe(true);
        }
      }
      expect(STUDENT_TURNS.some((text) => text.includes(result.strongerLine.original))).toBe(true);
    });

    it("rewards questions, a dated ask, and penalises their absence", async () => {
      const strong = await score(new FakeProvider());
      const weak = await score(new FakeProvider(), ["Um, sorry, I just maybe sell software."]);
      const get = (card: typeof strong, key: string) =>
        card.dimensions.find((dimension) => dimension.key === key)?.score ?? 0;
      expect(get(strong, "discovery")).toBeGreaterThan(get(weak, "discovery"));
      expect(get(strong, "cta")).toBe(5);
      expect(get(weak, "cta")).toBe(1);
      expect(get(strong, "confidence")).toBeGreaterThan(get(weak, "confidence"));
      expect(weak.dimensions.find((dimension) => dimension.key === "cta")?.evidence).toBeNull();
    });

    it("is identical across two runs with the same seed", async () => {
      expect(await score(new FakeProvider({ seed: 5 }))).toEqual(
        await score(new FakeProvider({ seed: 5 })),
      );
    });
  });

  describe("guard and moderation", () => {
    it("classifies input as ok by default", async () => {
      const result = await new FakeProvider().structured(
        {
          system: `${TASK_TAGS.guard} classify`,
          messages: [{ role: "user", content: "<student_turn>Hi</student_turn>" }],
          maxTokens: 50,
          schema: GuardSchema,
          schemaName: "guard",
        },
        signal(),
      );
      expect(result).toEqual({ category: "ok" });
    });

    it("does not flag text by default", async () => {
      const provider = new FakeProvider();
      expect(await provider.moderate("anything", signal())).toEqual({ flagged: false });
    });
  });

  describe("overrides", () => {
    it("uses an override for its task and validates the result", async () => {
      const provider = new FakeProvider({
        overrides: { guard: () => ({ category: "prompt_attack" }) },
      });
      const result = await provider.structured(
        {
          system: `${TASK_TAGS.guard} classify`,
          messages: [],
          maxTokens: 50,
          schema: GuardSchema,
          schemaName: "guard",
        },
        signal(),
      );
      expect(result).toEqual({ category: "prompt_attack" });
    });

    it("surfaces an invalid override as invalid_structured_output", async () => {
      const provider = new FakeProvider({ overrides: { score: () => '{"overall": "high"}' } });
      const error: unknown = await score(provider).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ProviderError);
      expect(error).toMatchObject({ code: "invalid_structured_output", retryable: false });
    });

    it("surfaces a non-JSON override as invalid_structured_output", async () => {
      const provider = new FakeProvider({ overrides: { plan: () => "not json" } });
      await expect(plan(provider)).rejects.toMatchObject({ code: "invalid_structured_output" });
    });

    it("passes the system prompt and messages to a turn override", async () => {
      const provider = new FakeProvider({
        overrides: {
          turn: ({ messages }) => `You said ${String(messages.length)}. [[stage:pitch]]`,
        },
      });
      expect((await collect(turn(provider, ["Hi."]))).join("")).toBe("You said 1. [[stage:pitch]]");
    });

    it("lets moderation be overridden", async () => {
      const provider = new FakeProvider({ overrides: { moderate: () => ({ flagged: true }) } });
      expect(await provider.moderate("anything", signal())).toEqual({ flagged: true });
    });
  });

  it("rejects a system prompt without a task tag", async () => {
    await expect(
      new FakeProvider().structured(
        { system: "no tag", messages: [], maxTokens: 50, schema: GuardSchema, schemaName: "guard" },
        signal(),
      ),
    ).rejects.toThrow(/task tag/);
  });
});
