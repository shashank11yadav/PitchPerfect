import { LIMITS } from "@pitchperfect/shared";
import { z } from "zod";

/** Raised when the environment is invalid. Messages name variables, never their values. */
export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

const DEV_ONLY_PREFIX = "dev-only-";
const SECRET_MIN_LENGTH = 32;

/** Environment variables arrive as strings; an empty string means "not set". */
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(emptyToUndefined, schema.optional());

const secret = z
  .string()
  .min(SECRET_MIN_LENGTH, `must be at least ${String(SECRET_MIN_LENGTH)} characters`);
/** Whole number at or above `min`; an empty string counts as unset and yields the default. */
const integer = (fallback: number, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().min(min).max(max).default(fallback));
const port = (fallback: number) => integer(fallback, { max: 65535 });
const flag = z.enum(["true", "false"]).transform((value) => value === "true");

const PRODUCTION_SECRETS = [
  "SESSION_SECRET",
  "CSRF_SECRET",
  "COACH_SHARED_SECRET",
  "PROXY_SHARED_SECRET",
] as const;

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: port(4000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    TRUST_PROXY: integer(0, { min: 0 }),
    APP_URL: z.url().default("http://localhost:3000"),
    MONGODB_URI: z
      .string()
      .regex(/^mongodb(\+srv)?:\/\/.+/, "must be a mongodb:// or mongodb+srv:// URI"),
    SESSION_SECRET: secret,
    CSRF_SECRET: secret,
    COACH_URL: z.url(),
    COACH_SHARED_SECRET: secret,
    PROXY_SHARED_SECRET: optional(secret),
    SMTP_HOST: optional(z.string()),
    SMTP_PORT: port(1025),
    SMTP_SECURE: flag.default(false),
    SMTP_USER: optional(z.string()),
    SMTP_PASS: optional(z.string()),
    MAIL_FROM: z.string().min(1).default("PitchPerfect <no-reply@pitchperfect.local>"),
    PRACTICE_DAILY_LIMIT: integer(LIMITS.dailyQuota),
    PRACTICE_MONTHLY_LIMIT: integer(LIMITS.monthlyQuota),
    PRACTICE_DAILY_TOKEN_BUDGET: integer(LIMITS.dailyTokenBudget),
    PRACTICE_RETENTION_DAYS: integer(LIMITS.attemptRetentionDays),
    HIBP_ENABLED: flag.default(true),
    REDIS_URL: optional(z.string()),
    SEED_DEMO_PASSWORD: optional(z.string().min(LIMITS.passwordMinLength)),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    for (const name of PRODUCTION_SECRETS) {
      if (env[name]?.startsWith(DEV_ONLY_PREFIX)) {
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: `must not be a "${DEV_ONLY_PREFIX}" placeholder in production`,
        });
      }
    }
    if (!env.APP_URL.startsWith("https://")) {
      ctx.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message: "must be an https URL in production",
      });
    }
    if (!env.SMTP_HOST) {
      ctx.addIssue({ code: "custom", path: ["SMTP_HOST"], message: "is required in production" });
    }
  })
  .transform((env) => ({ ...env, isProd: env.NODE_ENV === "production" }));

export type Config = z.output<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`),
    );
  }
  return result.data;
}
