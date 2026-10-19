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

const envSchema = z
  .object({
    NODE_ENV: unsetIfEmpty(z.enum(["development", "test", "production"]).default("development")),
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
    isProd: env.NODE_ENV === "production",
  }));

export type CoachConfig = z.output<typeof envSchema>;

export function loadCoachConfig(env: NodeJS.ProcessEnv): CoachConfig {
  return parseConfig(envSchema, env);
}
