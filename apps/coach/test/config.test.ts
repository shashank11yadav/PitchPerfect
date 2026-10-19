import { ConfigError } from "@pitchperfect/shared/env";
import { describe, expect, it } from "vitest";
import { loadCoachConfig } from "../src/config.js";
import { devEnv, prodEnv } from "./helpers/env.js";

function problemsFor(env: NodeJS.ProcessEnv): string {
  try {
    loadCoachConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as ConfigError).message;
  }
  throw new Error("expected loadCoachConfig to throw");
}

describe("loadCoachConfig", () => {
  it("returns a typed config for a valid development env", () => {
    const config = loadCoachConfig(devEnv());
    expect(config.COACH_PROVIDER).toBe("fake");
    expect(config.HOST).toBe("127.0.0.1");
    expect(config.PORT).toBe(4100);
    expect(config.COACH_TIMEOUT_MS).toBe(30_000);
    expect(config.isProd).toBe(false);
  });

  it("treats empty optional variables as unset and applies defaults", () => {
    const config = loadCoachConfig({
      COACH_SHARED_SECRET: devEnv().COACH_SHARED_SECRET,
      OPENAI_API_KEY: "",
      COACH_MODEL: "",
      PORT: "",
      HOST: "",
      COACH_TIMEOUT_MS: "",
    });
    expect(config.OPENAI_API_KEY).toBeUndefined();
    expect(config.COACH_MODEL).toBeUndefined();
    expect(config.PORT).toBe(4100);
    expect(config.HOST).toBe("127.0.0.1");
    expect(config.COACH_TIMEOUT_MS).toBe(30_000);
    expect(config.COACH_PROVIDER).toBe("fake");
    expect(config.NODE_ENV).toBe("development");
    expect(config.LOG_LEVEL).toBe("info");
  });

  it("requires the shared secret", () => {
    expect(problemsFor(devEnv({ COACH_SHARED_SECRET: "" }))).toContain("COACH_SHARED_SECRET");
  });

  it("rejects a secret shorter than 32 characters without printing it", () => {
    const message = problemsFor(devEnv({ COACH_SHARED_SECRET: "short-secret-value" }));
    expect(message).toContain("COACH_SHARED_SECRET");
    expect(message).not.toContain("short-secret-value");
  });

  it("rejects an unknown provider", () => {
    expect(problemsFor(devEnv({ COACH_PROVIDER: "other" }))).toContain("COACH_PROVIDER");
  });

  describe.each([
    ["openai", "OPENAI_API_KEY"],
    ["anthropic", "ANTHROPIC_API_KEY"],
  ] as const)("provider %s", (provider, keyName) => {
    it("names the missing key and both models", () => {
      const message = problemsFor(devEnv({ COACH_PROVIDER: provider }));
      expect(message).toContain(keyName);
      expect(message).toContain("COACH_MODEL");
      expect(message).toContain("COACH_SCORING_MODEL");
    });

    it("accepts a complete configuration", () => {
      const config = loadCoachConfig(
        devEnv({
          COACH_PROVIDER: provider,
          [keyName]: "placeholder-key",
          COACH_MODEL: "model-a",
          COACH_SCORING_MODEL: "model-b",
        }),
      );
      expect(config.COACH_PROVIDER).toBe(provider);
      expect(config[keyName]).toBe("placeholder-key");
    });

    it("does not require the other provider's key", () => {
      const other = keyName === "OPENAI_API_KEY" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
      const message = problemsFor(devEnv({ COACH_PROVIDER: provider }));
      expect(message).not.toContain(other);
    });
  });

  it("does not echo key values in errors", () => {
    const message = problemsFor(
      devEnv({ COACH_PROVIDER: "openai", OPENAI_API_KEY: "key-value-1" }),
    );
    expect(message).not.toContain("key-value-1");
  });

  it("refuses dev-only placeholder secrets in production", () => {
    const secret = devEnv().COACH_SHARED_SECRET;
    expect(problemsFor(prodEnv({ COACH_SHARED_SECRET: secret }))).toContain("COACH_SHARED_SECRET");
    expect(loadCoachConfig(prodEnv()).isProd).toBe(true);
  });

  describe("numeric variables", () => {
    it.each(["PORT", "COACH_TIMEOUT_MS"])("rejects %s=0 and non-integers", (name) => {
      for (const value of ["0", "-1", "1.5", "abc"]) {
        expect(problemsFor(devEnv({ [name]: value }))).toContain(name);
      }
    });

    it("rejects a port above 65535", () => {
      expect(problemsFor(devEnv({ PORT: "70000" }))).toContain("PORT");
    });
  });
});
