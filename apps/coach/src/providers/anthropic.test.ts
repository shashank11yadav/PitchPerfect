import Anthropic, { APIConnectionTimeoutError, APIError } from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { devEnv } from "../../test/helpers/env.js";
import { loadCoachConfig } from "../config.js";
import { AnthropicProvider } from "./anthropic.js";
import { createUsageMeter, ProviderError, TASK_TAGS, type UsageMeter } from "./index.js";

const config = loadCoachConfig(
  devEnv({
    COACH_PROVIDER: "anthropic",
    ANTHROPIC_API_KEY: "test-key",
    COACH_MODEL: "test-model",
    COACH_SCORING_MODEL: "test-scoring-model",
    COACH_TIMEOUT_MS: "12345",
  }),
);

const GuardSchema = z.strictObject({ category: z.enum(["ok", "harmful"]) });
const messages = [{ role: "user" as const, content: "<student_turn>Hi</student_turn>" }];
const usage = { input_tokens: 40, output_tokens: 9, cache_read_input_tokens: 2 };

type Handler = (body: Record<string, unknown>, options?: Record<string, unknown>) => unknown;

function fakeClient({ stream, create }: { stream?: Handler; create?: Handler }) {
  const streamFn = vi.fn(stream ?? (() => null));
  const createFn = vi.fn(create ?? (() => null));
  const client = { messages: { stream: streamFn, create: createFn } } as unknown as Anthropic;
  return { client, streamFn, createFn };
}

/** Mimics `MessageStream`: async-iterable events plus `finalMessage()`. */
function messageStream(
  events: unknown[],
  final: unknown,
  failAfter?: Error,
  afterEvents?: () => void,
) {
  return {
    async *[Symbol.asyncIterator]() {
      await Promise.resolve();
      for (const event of events) yield event;
      afterEvents?.();
      if (failAfter) throw failAfter;
    },
    finalMessage: () => Promise.resolve(final),
  };
}

const textDelta = (text: string) => ({
  type: "content_block_delta",
  index: 0,
  delta: { type: "text_delta", text },
});

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let text = "";
  for await (const chunk of stream) text += chunk;
  return text;
}

const toolMessage = (input: unknown) => ({
  role: "assistant",
  content: [{ type: "tool_use", id: "toolu_test", name: "guard", input }],
  stop_reason: "tool_use",
  usage,
});

const guard = (
  provider: AnthropicProvider,
  system = `${TASK_TAGS.guard} classify`,
  meter?: UsageMeter,
  maxTokens = 50,
) =>
  provider.structured(
    { system, messages, maxTokens, schema: GuardSchema, schemaName: "guard" },
    new AbortController().signal,
    meter,
  );

const turnInput = { system: TASK_TAGS.turn, messages, maxTokens: 200, temperature: 0.7 };

describe("AnthropicProvider", () => {
  it("is named anthropic and has no moderation endpoint", () => {
    const provider = new AnthropicProvider({ config, client: fakeClient({}).client });
    expect(provider.name).toBe("anthropic");
    expect("moderate" in provider).toBe(false);
  });

  describe("chatStream", () => {
    it("streams a message and concatenates the text deltas", async () => {
      const { client, streamFn } = fakeClient({
        stream: () =>
          messageStream(
            [
              { type: "message_start", message: {} },
              { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
              textDelta("Thanks for"),
              textDelta(" calling."),
              { type: "content_block_stop", index: 0 },
              { type: "message_stop" },
            ],
            { content: [], usage },
          ),
      });
      const provider = new AnthropicProvider({ config, client });
      const controller = new AbortController();
      const meter = createUsageMeter();
      const text = await collect(
        provider.chatStream(
          { system: `${TASK_TAGS.turn} rules`, messages, maxTokens: 200, temperature: 0.7 },
          controller.signal,
          meter,
        ),
      );

      expect(text).toBe("Thanks for calling.");
      expect(meter.total()).toEqual({ inputTokens: 42, outputTokens: 9 });
      expect(streamFn).toHaveBeenCalledWith(
        {
          model: "test-model",
          max_tokens: 200,
          system: `${TASK_TAGS.turn} rules`,
          messages,
        },
        { signal: controller.signal, timeout: 12345 },
      );
    });

    it("maps a failure during streaming to a ProviderError", async () => {
      const { client } = fakeClient({
        stream: () =>
          messageStream(
            [textDelta("Hel")],
            null,
            APIError.generate(529, undefined, "overloaded", new Headers()),
          ),
      });
      const result = collect(
        new AnthropicProvider({ config, client }).chatStream(
          { system: TASK_TAGS.turn, messages, maxTokens: 200, temperature: 0.7 },
          new AbortController().signal,
        ),
      );
      await expect(result).rejects.toMatchObject({ code: "upstream_unavailable", retryable: true });
    });

    it("rejects as aborted when an aborted stream ends without an error", async () => {
      const controller = new AbortController();
      const { client } = fakeClient({
        stream: () =>
          messageStream([textDelta("Hel")], { content: [], usage }, undefined, () => {
            controller.abort();
          }),
      });
      const result = collect(
        new AnthropicProvider({ config, client }).chatStream(turnInput, controller.signal),
      );
      await expect(result).rejects.toMatchObject({ code: "aborted", retryable: false });
    });

    it("maps a timed-out signal to a retryable timeout", async () => {
      const controller = new AbortController();
      const { client } = fakeClient({
        stream: () =>
          messageStream([textDelta("Hel")], { content: [], usage }, undefined, () => {
            controller.abort(new DOMException("The operation timed out.", "TimeoutError"));
          }),
      });
      const result = collect(
        new AnthropicProvider({ config, client }).chatStream(turnInput, controller.signal),
      );
      await expect(result).rejects.toMatchObject({ code: "timeout", retryable: true });
    });
  });

  describe("usage metering", () => {
    it("meters each call into its own meter when calls run concurrently", async () => {
      const { client } = fakeClient({
        create: (body) => ({
          ...toolMessage({ category: "ok" }),
          usage: { input_tokens: body.max_tokens, output_tokens: 1 },
        }),
      });
      const provider = new AnthropicProvider({ config, client });
      const [first, second] = [createUsageMeter(), createUsageMeter()];
      await Promise.all([
        guard(provider, undefined, first, 50),
        guard(provider, undefined, second, 60),
      ]);
      expect(first.total()).toEqual({ inputTokens: 50, outputTokens: 1 });
      expect(second.total()).toEqual({ inputTokens: 60, outputTokens: 1 });
    });

    it("meters a call whose output then fails validation, once", async () => {
      const { client } = fakeClient({ create: () => toolMessage({ category: 3 }) });
      const meter = { add: vi.fn() };
      await expect(
        guard(new AnthropicProvider({ config, client }), undefined, meter),
      ).rejects.toThrow(ProviderError);
      expect(meter.add).toHaveBeenCalledTimes(1);
      expect(meter.add).toHaveBeenCalledWith({ inputTokens: 42, outputTokens: 9 });
    });
  });

  describe("structured", () => {
    it("forces a single tool whose input schema is the JSON schema", async () => {
      const { client, createFn } = fakeClient({ create: () => toolMessage({ category: "ok" }) });
      const provider = new AnthropicProvider({ config, client });

      const meter = createUsageMeter();
      expect(await guard(provider, undefined, meter)).toEqual({ category: "ok" });
      expect(meter.total()).toEqual({ inputTokens: 42, outputTokens: 9 });
      const [body, options] = createFn.mock.calls[0] ?? [];
      expect(body).toEqual({
        model: "test-model",
        max_tokens: 50,
        system: `${TASK_TAGS.guard} classify`,
        messages,
        tools: [
          {
            name: "guard",
            input_schema: {
              type: "object",
              properties: { category: { type: "string", enum: ["ok", "harmful"] } },
              required: ["category"],
              additionalProperties: false,
            },
          },
        ],
        tool_choice: { type: "tool", name: "guard" },
      });
      expect(options).toMatchObject({ timeout: 12345 });
      expect(options?.signal).toBeInstanceOf(AbortSignal);
    });

    it("fails a schema that cannot be converted before calling the API", async () => {
      const { client, createFn } = fakeClient({ create: () => toolMessage({}) });
      const result = new AnthropicProvider({ config, client }).structured(
        { system: TASK_TAGS.plan, messages, maxTokens: 50, schema: z.bigint(), schemaName: "n" },
        new AbortController().signal,
      );
      const error: unknown = await result.catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(ProviderError);
      expect(createFn).not.toHaveBeenCalled();
    });

    it("uses the scoring model for scoring calls", async () => {
      const { client, createFn } = fakeClient({ create: () => toolMessage({ category: "ok" }) });
      await guard(new AnthropicProvider({ config, client }), `${TASK_TAGS.score} score`);
      expect(createFn.mock.calls[0]?.[0]).toMatchObject({ model: "test-scoring-model" });
    });

    it("throws invalid_structured_output when the tool input fails the zod schema", async () => {
      const { client } = fakeClient({ create: () => toolMessage({ category: 3 }) });
      const error: unknown = await guard(new AnthropicProvider({ config, client })).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(ProviderError);
      expect(error).toMatchObject({ code: "invalid_structured_output", retryable: false });
    });

    it("throws invalid_structured_output when no tool call comes back", async () => {
      const { client } = fakeClient({
        create: () => ({ content: [{ type: "text", text: "No." }], usage }),
      });
      await expect(guard(new AnthropicProvider({ config, client }))).rejects.toMatchObject({
        code: "invalid_structured_output",
      });
    });
  });

  describe("error mapping", () => {
    const cases = [
      { status: 429, code: "rate_limited", retryable: true },
      { status: 500, code: "upstream_unavailable", retryable: true },
      { status: 529, code: "upstream_unavailable", retryable: true },
      { status: 400, code: "request_rejected", retryable: false },
    ];
    for (const { status, code, retryable } of cases) {
      it(`maps HTTP ${String(status)} to ${code}`, async () => {
        const { client } = fakeClient({
          create: () => {
            throw APIError.generate(status, undefined, "failed", new Headers());
          },
        });
        await expect(guard(new AnthropicProvider({ config, client }))).rejects.toMatchObject({
          code,
          retryable,
        });
      });
    }

    it("maps a timeout to a retryable timeout error", async () => {
      const { client } = fakeClient({
        create: () => {
          throw new APIConnectionTimeoutError();
        },
      });
      await expect(guard(new AnthropicProvider({ config, client }))).rejects.toMatchObject({
        code: "timeout",
        retryable: true,
      });
    });

    it("reports aborted when the caller's signal was aborted", async () => {
      const controller = new AbortController();
      const { client } = fakeClient({
        create: () => {
          controller.abort();
          throw new Error("aborted");
        },
      });
      const result = new AnthropicProvider({ config, client }).structured(
        {
          system: TASK_TAGS.guard,
          messages,
          maxTokens: 50,
          schema: GuardSchema,
          schemaName: "guard",
        },
        controller.signal,
      );
      await expect(result).rejects.toMatchObject({ code: "aborted", retryable: false });
    });
  });
});
