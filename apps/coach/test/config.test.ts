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

  describe("COACH_PROVIDER in production", () => {
    it("must be set explicitly", () => {
      expect(problemsFor(prodEnv({ COACH_PROVIDER: "" }))).toContain("COACH_PROVIDER");
      const env = prodEnv();
      delete env.COACH_PROVIDER;
      expect(problemsFor(env)).toContain("COACH_PROVIDER");
    });

    it("may be an explicit fake", () => {
      expect(loadCoachConfig(prodEnv({ COACH_PROVIDER: "fake" })).COACH_PROVIDER).toBe("fake");
    });

    it("may stay unset outside production", () => {
      const env = devEnv();
      delete env.COACH_PROVIDER;
      expect(loadCoachConfig(env).COACH_PROVIDER).toBe("fake");
    });
  });

  describe("COACH_MODERATOR", () => {
    const live = (provider: "openai" | "anthropic", extra: NodeJS.ProcessEnv = {}) => ({
      COACH_PROVIDER: provider,
      [provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"]: "placeholder-key",
      COACH_MODEL: "model-a",
      COACH_SCORING_MODEL: "model-b",
      ...extra,
    });

    it("defaults to the OpenAI endpoint with an OpenAI key, else the model classifier", () => {
      expect(loadCoachConfig(devEnv(live("openai"))).COACH_MODERATOR).toBe("openai");
      expect(loadCoachConfig(devEnv(live("anthropic"))).COACH_MODERATOR).toBe("model");
      const both = live("anthropic", { OPENAI_API_KEY: "placeholder-key" });
      expect(loadCoachConfig(devEnv(both)).COACH_MODERATOR).toBe("openai");
      expect(loadCoachConfig(prodEnv(live("anthropic"))).COACH_MODERATOR).toBe("model");
    });

    it("defaults to none for the scripted partner", () => {
      expect(loadCoachConfig(devEnv()).COACH_MODERATOR).toBe("none");
      expect(loadCoachConfig(prodEnv()).COACH_MODERATOR).toBe("none");
      expect(loadCoachConfig(devEnv({ OPENAI_API_KEY: "placeholder-key" })).COACH_MODERATOR).toBe(
        "none",
      );
    });

    it("needs an OpenAI key for the OpenAI endpoint", () => {
      const env = devEnv(live("anthropic", { COACH_MODERATOR: "openai" }));
      expect(problemsFor(env)).toContain("OPENAI_API_KEY");
    });

    it("never sends the scripted partner's replies to OpenAI", () => {
      const env = devEnv({ COACH_MODERATOR: "openai", OPENAI_API_KEY: "placeholder-key" });
      expect(problemsFor(env)).toContain("COACH_MODERATOR");
    });

    it("refuses to start in production with a live provider and no moderator", () => {
      for (const provider of ["openai", "anthropic"] as const) {
        const message = problemsFor(prodEnv(live(provider, { COACH_MODERATOR: "none" })));
        expect(message).toContain("COACH_MODERATOR");
      }
    });

    it("allows no moderator outside production", () => {
      const env = devEnv(live("anthropic", { COACH_MODERATOR: "none" }));
      expect(loadCoachConfig(env).COACH_MODERATOR).toBe("none");
    });

    it("rejects an unknown moderator", () => {
      expect(problemsFor(devEnv({ COACH_MODERATOR: "regex" }))).toContain("COACH_MODERATOR");
    });
  });

  describe("numeric variables", () => {
    it("defaults the moderation timeout to 5 seconds", () => {
      expect(loadCoachConfig(devEnv()).COACH_MODERATION_TIMEOUT_MS).toBe(5_000);
    });

    it.each(["PORT", "COACH_TIMEOUT_MS", "COACH_MODERATION_TIMEOUT_MS"])(
      "rejects %s=0 and non-integers",
      (name) => {
        for (const value of ["0", "-1", "1.5", "abc"]) {
          expect(problemsFor(devEnv({ [name]: value }))).toContain(name);
        }
      },
    );

    it("rejects a port above 65535", () => {
      expect(problemsFor(devEnv({ PORT: "70000" }))).toContain("PORT");
    });
  });
});
