import { ScorecardSchema } from "@pitchperfect/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { devEnv } from "../../test/helpers/env.js";
import { loadCoachConfig } from "../config.js";
import { FakeProvider, createProvider, taskOf, TASK_TAGS } from "./index.js";
import { toJsonSchema, toStrictJsonSchema } from "./json-schema.js";

const realEnv = (provider: "openai" | "anthropic") =>
  devEnv({
    COACH_PROVIDER: provider,
    OPENAI_API_KEY: "test-key",
    ANTHROPIC_API_KEY: "test-key",
    COACH_MODEL: "test-model",
    COACH_SCORING_MODEL: "test-scoring-model",
  });

describe("createProvider", () => {
  it("selects the fake provider", () => {
    const provider = createProvider(loadCoachConfig(devEnv({ COACH_PROVIDER: "fake" })));
    expect(provider).toBeInstanceOf(FakeProvider);
    expect(provider.name).toBe("fake");
  });

  it("selects the openai provider", () => {
    expect(createProvider(loadCoachConfig(realEnv("openai"))).name).toBe("openai");
  });

  it("selects the anthropic provider", () => {
    expect(createProvider(loadCoachConfig(realEnv("anthropic"))).name).toBe("anthropic");
  });

  it("throws a clear error when the provider's key is missing", () => {
    const config = { ...loadCoachConfig(realEnv("openai")), OPENAI_API_KEY: undefined };
    expect(() => createProvider(config)).toThrow(
      "OPENAI_API_KEY is required when COACH_PROVIDER is openai",
    );
  });

  it("throws a clear error when a model is missing", () => {
    const config = { ...loadCoachConfig(realEnv("anthropic")), COACH_SCORING_MODEL: "" };
    expect(() => createProvider(config)).toThrow(
      "COACH_SCORING_MODEL is required when COACH_PROVIDER is anthropic",
    );
  });
});

describe("task tags", () => {
  it("reads the task from the start of the system prompt", () => {
    expect(taskOf(`${TASK_TAGS.score}\nScore this.`)).toBe("score");
    expect(taskOf(`  ${TASK_TAGS.turn} Reply.`)).toBe("turn");
    expect(taskOf(`Reply. ${TASK_TAGS.turn}`)).toBeUndefined();
  });
});

describe("toJsonSchema", () => {
  it("converts a zod schema without the $schema marker", () => {
    const schema = toJsonSchema(z.strictObject({ name: z.string().min(1).max(5) }));
    expect(schema).toEqual({
      type: "object",
      properties: { name: { type: "string", minLength: 1, maxLength: 5 } },
      required: ["name"],
      additionalProperties: false,
    });
  });

  it("collapses a union of literals into an enum", () => {
    const schema = toJsonSchema(z.object({ score: z.union([z.literal(1), z.literal(2)]) }));
    expect(schema).toMatchObject({ properties: { score: { type: "number", enum: [1, 2] } } });
  });
});

describe("toStrictJsonSchema", () => {
  it("expresses the scorecard in strict mode", () => {
    const { schema, strict } = toStrictJsonSchema(ScorecardSchema);
    expect(strict).toBe(true);
    const text = JSON.stringify(schema);
    expect(text).not.toMatch(/minLength|maxLength|"const"|\$schema/);
    expect(schema).toMatchObject({
      additionalProperties: false,
      required: ["overall", "dimensions", "strengths", "improvements", "strongerLine"],
    });
  });

  it("closes non-strict zod objects", () => {
    const { schema, strict } = toStrictJsonSchema(z.object({ a: z.object({ b: z.string() }) }));
    expect(strict).toBe(true);
    expect(schema).toMatchObject({
      additionalProperties: false,
      properties: { a: { additionalProperties: false } },
    });
  });

  it("falls back to non-strict when a property is optional", () => {
    const { schema, strict } = toStrictJsonSchema(
      z.object({ a: z.string().min(2), b: z.string().optional() }),
    );
    expect(strict).toBe(false);
    expect(schema).toEqual(
      toJsonSchema(z.object({ a: z.string().min(2), b: z.string().optional() })),
    );
  });

  it("falls back to non-strict when extra properties are allowed", () => {
    expect(toStrictJsonSchema(z.looseObject({ a: z.string() })).strict).toBe(false);
  });
});
