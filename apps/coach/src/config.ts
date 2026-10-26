import {
  DEV_ONLY_PREFIX,
  optional,
  parseConfig,
  port,
  integer,
  secret,
  unsetIfEmpty,
} from "@pitchperfect/shared/env";
import { z } from "zod";

const PROVIDER_KEYS = { openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY" } as const;

type ModeratorChoice = "openai" | "model" | "none";

/**
 * `COACH_MODERATOR` as set, or the default: the OpenAI moderation endpoint when there is an OpenAI
 * key, otherwise a classifier call through the configured model. The scripted (`fake`) partner
 * gets none by default; its replies are fixed lines and the local rules still check them.
 */
function moderatorFor(env: {
  COACH_MODERATOR?: ModeratorChoice | undefined;
  COACH_PROVIDER?: "fake" | "openai" | "anthropic" | undefined;
  OPENAI_API_KEY?: string | undefined;
}): ModeratorChoice {
  if (env.COACH_MODERATOR) return env.COACH_MODERATOR;
  if (!env.COACH_PROVIDER || env.COACH_PROVIDER === "fake") return "none";
  return env.OPENAI_API_KEY ? "openai" : "model";
}

const envSchema = z
  .object({
    // Unset means production: development and test behaviour must be asked for.
    NODE_ENV: unsetIfEmpty(z.enum(["development", "test", "production"]).default("production")),
    HOST: unsetIfEmpty(z.string().min(1).default("127.0.0.1")),
    PORT: port(4100),
    LOG_LEVEL: unsetIfEmpty(
      z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    ),
    COACH_SHARED_SECRET: secret,
    // Unset means `fake` outside production; see the production check below.
    COACH_PROVIDER: optional(z.enum(["fake", "openai", "anthropic"])),
    OPENAI_API_KEY: optional(z.string()),
    ANTHROPIC_API_KEY: optional(z.string()),
    COACH_MODEL: optional(z.string()),
    COACH_SCORING_MODEL: optional(z.string()),
    COACH_TIMEOUT_MS: integer(30_000),
    // Unset picks one; see moderatorFor().
    COACH_MODERATOR: optional(z.enum(["openai", "model", "none"])),
    COACH_MODERATION_TIMEOUT_MS: integer(5_000),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && !env.COACH_PROVIDER) {
      ctx.addIssue({
        code: "custom",
        path: ["COACH_PROVIDER"],
        message: "must be set explicitly in production",
      });
    }
    const provider = env.COACH_PROVIDER ?? "fake";
    const moderator = moderatorFor(env);
    if (moderator === "openai" && !env.OPENAI_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["OPENAI_API_KEY"],
        message: "is required when COACH_MODERATOR is openai",
      });
    }
    if (moderator === "openai" && provider === "fake") {
      // The scripted partner is disclosed as sending nothing to an AI provider.
      ctx.addIssue({
        code: "custom",
        path: ["COACH_MODERATOR"],
        message: "cannot be openai when COACH_PROVIDER is fake",
      });
    }
    if (env.NODE_ENV === "production" && provider !== "fake" && moderator === "none") {
      ctx.addIssue({
        code: "custom",
        path: ["COACH_MODERATOR"],
        message: `must be openai or model in production when COACH_PROVIDER is ${provider}`,
      });
    }
    if (provider !== "fake") {
      const required = [PROVIDER_KEYS[provider], "COACH_MODEL", "COACH_SCORING_MODEL"] as const;
      for (const name of required) {
        if (!env[name]) {
          ctx.addIssue({
            code: "custom",
            path: [name],
            message: `is required when COACH_PROVIDER is ${provider}`,
          });
        }
      }
    }
    if (env.NODE_ENV === "production" && env.COACH_SHARED_SECRET.startsWith(DEV_ONLY_PREFIX)) {
      ctx.addIssue({
        code: "custom",
        path: ["COACH_SHARED_SECRET"],
        message: `must not be a "${DEV_ONLY_PREFIX}" placeholder in production`,
      });
    }
  })
  .transform((env) => ({
    ...env,
    COACH_PROVIDER: env.COACH_PROVIDER ?? ("fake" as const),
    COACH_MODERATOR: moderatorFor(env),
    isProd: env.NODE_ENV === "production",
  }));

export type CoachConfig = z.output<typeof envSchema>;

export function loadCoachConfig(env: NodeJS.ProcessEnv): CoachConfig {
  return parseConfig(envSchema, env);
}
