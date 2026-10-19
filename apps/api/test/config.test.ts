import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.js";
import { devEnv, prodEnv } from "./helpers/env.js";

describe("loadConfig", () => {
  it("returns a typed config for a valid development env", () => {
    const config = loadConfig(devEnv());
    expect(config.PRACTICE_DAILY_LIMIT).toBe(5);
    expect(config.PRACTICE_MONTHLY_LIMIT).toBe(30);
    expect(config.PORT).toBe(4000);
    expect(config.isProd).toBe(false);
    expect(config.SMTP_SECURE).toBe(false);
  });

  it("treats empty optional variables as unset", () => {
    const config = loadConfig(devEnv());
    expect(config.PROXY_SHARED_SECRET).toBeUndefined();
    expect(config.REDIS_URL).toBeUndefined();
    expect(config.SEED_DEMO_PASSWORD).toBeUndefined();
    expect(config.SMTP_USER).toBeUndefined();
    expect(config.SMTP_PASS).toBeUndefined();
  });

  it("coerces numbers and booleans and applies defaults", () => {
    const env = devEnv({ PORT: "5000", HIBP_ENABLED: "true", TRUST_PROXY: "2" });
    delete env.PRACTICE_RETENTION_DAYS;
    delete env.LOG_LEVEL;
    const config = loadConfig(env);
    expect(config.PORT).toBe(5000);
    expect(config.HIBP_ENABLED).toBe(true);
    expect(config.TRUST_PROXY).toBe(2);
    expect(config.PRACTICE_RETENTION_DAYS).toBe(180);
    expect(config.LOG_LEVEL).toBe("info");
  });

  it("throws a ConfigError when MONGODB_URI is missing", () => {
    const env = devEnv();
    delete env.MONGODB_URI;
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(/MONGODB_URI/);
  });

  it("lists every problem in one error", () => {
    const env = devEnv({ PORT: "abc", COACH_URL: "not a url" });
    try {
      loadConfig(env);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).problems.map((problem) => problem.split(":")[0])).toEqual(
        expect.arrayContaining(["PORT", "COACH_URL"]),
      );
    }
  });

  it("rejects secrets shorter than 32 characters without echoing them", () => {
    const env = devEnv({ SESSION_SECRET: "tooshortvalue" });
    expect(() => loadConfig(env)).toThrow(/SESSION_SECRET/);
    expect(() => loadConfig(env)).not.toThrow(/tooshortvalue/);
  });

  it("rejects unknown NODE_ENV and LOG_LEVEL values", () => {
    expect(() => loadConfig(devEnv({ NODE_ENV: "staging" }))).toThrow(/NODE_ENV/);
    expect(() => loadConfig(devEnv({ LOG_LEVEL: "loud" }))).toThrow(/LOG_LEVEL/);
  });

  describe("production", () => {
    it("accepts a complete production env", () => {
      const config = loadConfig(prodEnv());
      expect(config.isProd).toBe(true);
    });

    it.each(["SESSION_SECRET", "CSRF_SECRET", "COACH_SHARED_SECRET", "PROXY_SHARED_SECRET"])(
      "rejects a dev-only %s",
      (name) => {
        const env = prodEnv({ [name]: `dev-only-${"x".repeat(40)}` });
        expect(() => loadConfig(env)).toThrow(ConfigError);
        expect(() => loadConfig(env)).toThrow(new RegExp(name));
      },
    );

    it("requires an https APP_URL", () => {
      const env = prodEnv({ APP_URL: "http://pitchperfect.example.com" });
      expect(() => loadConfig(env)).toThrow(/APP_URL/);
    });

    it("requires a non-empty SMTP_HOST", () => {
      const env = prodEnv({ SMTP_HOST: "" });
      expect(() => loadConfig(env)).toThrow(/SMTP_HOST/);
    });
  });
});
