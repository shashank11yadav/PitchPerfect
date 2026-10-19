import OpenAI, { APIConnectionError, APIError, APIUserAbortError } from "openai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { devEnv } from "../../test/helpers/env.js";
import { loadCoachConfig } from "../config.js";
import { OpenAiProvider } from "./openai.js";
import { ProviderError, TASK_TAGS } from "./index.js";

const config = loadCoachConfig(
  devEnv({
    COACH_PROVIDER: "openai",
    OPENAI_API_KEY: "test-key",
    COACH_MODEL: "test-model",
    COACH_SCORING_MODEL: "test-scoring-model",
    COACH_TIMEOUT_MS: "12345",
  }),
);

const GuardSchema = z.strictObject({ category: z.enum(["ok", "harmful"]) });
const messages = [{ role: "user" as const, content: "<student_turn>Hi</student_turn>" }];

type Create = (body: Record<string, unknown>, options?: Record<string, unknown>) => unknown;

function fakeClient(create: Create, moderate?: Create) {
  const chatCreate = vi.fn(create);
  const moderationsCreate = vi.fn(moderate ?? (() => ({ results: [{ flagged: false }] })));
  const client = {
    chat: { completions: { create: chatCreate } },
    moderations: { create: moderationsCreate },
  } as unknown as OpenAI;
  return { client, chatCreate, moderationsCreate };
}

async function* chunks(...items: unknown[]) {
  await Promise.resolve();
  for (const item of items) yield item;
}

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let text = "";
  for await (const chunk of stream) text += chunk;
  return text;
}

const completion = (content: string | null, refusal: string | null = null) => ({
  choices: [{ message: { role: "assistant", content, refusal } }],
  usage: { prompt_tokens: 30, completion_tokens: 7, total_tokens: 37 },
});

const guard = (provider: OpenAiProvider, system = `${TASK_TAGS.guard} classify`) =>
  provider.structured(
    { system, messages, maxTokens: 50, schema: GuardSchema, schemaName: "guard" },
    new AbortController().signal,
  );

describe("OpenAiProvider", () => {
  it("is named openai and exposes moderation", () => {
    const provider = new OpenAiProvider({ config, client: fakeClient(() => null).client });
    expect(provider.name).toBe("openai");
    expect(typeof provider.moderate).toBe("function");
  });

  describe("chatStream", () => {
    it("streams a chat completion and concatenates the deltas", async () => {
      const { client, chatCreate } = fakeClient(() =>
        chunks(
          { choices: [{ delta: { role: "assistant", content: "" } }] },
          { choices: [{ delta: { content: "Hello" } }] },
          { choices: [{ delta: { content: ", there." } }] },
          { choices: [], usage: { prompt_tokens: 21, completion_tokens: 4, total_tokens: 25 } },
        ),
      );
      const provider = new OpenAiProvider({ config, client });
      const controller = new AbortController();
      const text = await collect(
        provider.chatStream(
          { system: `${TASK_TAGS.turn} rules`, messages, maxTokens: 200, temperature: 0.7 },
          controller.signal,
        ),
      );

      expect(text).toBe("Hello, there.");
      expect(provider.lastUsage()).toEqual({ inputTokens: 21, outputTokens: 4 });
      expect(chatCreate).toHaveBeenCalledWith(
        {
          model: "test-model",
          stream: true,
          stream_options: { include_usage: true },
          max_completion_tokens: 200,
          temperature: 0.7,
          messages: [{ role: "developer", content: `${TASK_TAGS.turn} rules` }, ...messages],
        },
        { signal: controller.signal, timeout: 12345 },
      );
    });

    it("maps a failure during streaming to a ProviderError", async () => {
      const { client } = fakeClient(() =>
        (async function* () {
          await Promise.resolve();
          yield { choices: [{ delta: { content: "Hel" } }] };
          throw APIError.generate(503, undefined, "unavailable", new Headers());
        })(),
      );
      const provider = new OpenAiProvider({ config, client });
      const result = collect(
        provider.chatStream(
          { system: TASK_TAGS.turn, messages, maxTokens: 200, temperature: 0.7 },
          new AbortController().signal,
        ),
      );
      await expect(result).rejects.toMatchObject({ code: "upstream_unavailable", retryable: true });
    });
  });

  describe("structured", () => {
    it("requests a strict JSON schema response and validates it", async () => {
      const { client, chatCreate } = fakeClient(() => completion('{"category":"ok"}'));
      const provider = new OpenAiProvider({ config, client });

      expect(await guard(provider)).toEqual({ category: "ok" });
      expect(provider.lastUsage()).toEqual({ inputTokens: 30, outputTokens: 7 });
      const [body, options] = chatCreate.mock.calls[0] ?? [];
      expect(body).toMatchObject({
        model: "test-model",
        max_completion_tokens: 50,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "guard",
            strict: true,
            schema: {
              type: "object",
              properties: { category: { type: "string", enum: ["ok", "harmful"] } },
              required: ["category"],
              additionalProperties: false,
            },
          },
        },
      });
      expect(body).not.toHaveProperty("stream");
      expect(options).toMatchObject({ timeout: 12345 });
      expect(options?.signal).toBeInstanceOf(AbortSignal);
    });

    it("uses the scoring model for scoring calls", async () => {
      const { client, chatCreate } = fakeClient(() => completion('{"category":"ok"}'));
      await guard(new OpenAiProvider({ config, client }), `${TASK_TAGS.score} score it`);
      expect(chatCreate.mock.calls[0]?.[0]).toMatchObject({ model: "test-scoring-model" });
    });

    it("throws invalid_structured_output when the JSON fails the zod schema", async () => {
      const { client } = fakeClient(() => completion('{"category":"maybe"}'));
      const error: unknown = await guard(new OpenAiProvider({ config, client })).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(ProviderError);
      expect(error).toMatchObject({ code: "invalid_structured_output", retryable: false });
      expect((error as ProviderError).detail).toMatch(/category/);
    });

    it("throws invalid_structured_output for non-JSON content", async () => {
      const { client } = fakeClient(() => completion("Sure! Here you go."));
      await expect(guard(new OpenAiProvider({ config, client }))).rejects.toMatchObject({
        code: "invalid_structured_output",
      });
    });

    it("throws invalid_structured_output when the model refuses", async () => {
      const { client } = fakeClient(() => completion(null, "I can't help with that."));
      await expect(guard(new OpenAiProvider({ config, client }))).rejects.toMatchObject({
        code: "invalid_structured_output",
      });
    });

    it("falls back to non-strict mode for schemas strict mode cannot express", async () => {
      const { client, chatCreate } = fakeClient(() => completion('{"name":"x"}'));
      const provider = new OpenAiProvider({ config, client });
      const result = await provider.structured(
        {
          system: TASK_TAGS.plan,
          messages,
          maxTokens: 600,
          schema: z.object({ name: z.string(), note: z.string().optional() }),
          schemaName: "plan",
        },
        new AbortController().signal,
      );
      expect(result).toEqual({ name: "x" });
      expect(chatCreate.mock.calls[0]?.[0]).toMatchObject({
        response_format: { json_schema: { strict: false } },
      });
    });
  });

  describe("error mapping", () => {
    const cases = [
      { status: 429, code: "rate_limited", retryable: true },
      { status: 500, code: "upstream_unavailable", retryable: true },
      { status: 503, code: "upstream_unavailable", retryable: true },
      { status: 400, code: "request_rejected", retryable: false },
      { status: 401, code: "request_rejected", retryable: false },
    ];
    for (const { status, code, retryable } of cases) {
      it(`maps HTTP ${String(status)} to ${code}`, async () => {
        const { client } = fakeClient(() => {
          throw APIError.generate(status, undefined, "failed", new Headers());
        });
        await expect(guard(new OpenAiProvider({ config, client }))).rejects.toMatchObject({
          code,
          retryable,
          status,
        });
      });
    }

    it("maps connection errors to a retryable error", async () => {
      const { client } = fakeClient(() => {
        throw new APIConnectionError({ message: "socket hang up" });
      });
      await expect(guard(new OpenAiProvider({ config, client }))).rejects.toMatchObject({
        code: "upstream_unavailable",
        retryable: true,
      });
    });

    it("maps an aborted request to a non-retryable aborted error", async () => {
      const { client } = fakeClient(() => {
        throw new APIUserAbortError();
      });
      await expect(guard(new OpenAiProvider({ config, client }))).rejects.toMatchObject({
        code: "aborted",
        retryable: false,
      });
    });

    it("never puts upstream messages into the error message", async () => {
      const { client } = fakeClient(() => {
        throw APIError.generate(400, undefined, "secret upstream detail", new Headers());
      });
      const error: unknown = await guard(new OpenAiProvider({ config, client })).catch(
        (caught: unknown) => caught,
      );
      expect((error as Error).message).not.toMatch(/secret upstream detail/);
    });
  });

  describe("moderate", () => {
    it("calls the moderation endpoint and reports whether any result is flagged", async () => {
      const { client, moderationsCreate } = fakeClient(
        () => null,
        () => ({ results: [{ flagged: false }, { flagged: true }] }),
      );
      const provider = new OpenAiProvider({ config, client });
      const controller = new AbortController();
      expect(await provider.moderate("some reply", controller.signal)).toEqual({ flagged: true });
      expect(moderationsCreate).toHaveBeenCalledWith(
        { input: "some reply" },
        { signal: controller.signal, timeout: 12345 },
      );
    });

    it("maps moderation failures to a ProviderError", async () => {
      const { client } = fakeClient(
        () => null,
        () => {
          throw APIError.generate(429, undefined, "slow down", new Headers());
        },
      );
      await expect(
        new OpenAiProvider({ config, client }).moderate("x", new AbortController().signal),
      ).rejects.toMatchObject({ code: "rate_limited" });
    });
  });
});
