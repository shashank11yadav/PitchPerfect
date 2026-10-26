import { isIP } from "node:net";
import { LIMITS } from "@pitchperfect/shared";
import {
  ConfigError,
  DEV_ONLY_PREFIX,
  integer,
  optional,
  parseConfig,
  port,
  secret,
  unsetIfEmpty,
} from "@pitchperfect/shared/env";
import { z } from "zod";

export { ConfigError };

const flag = z.enum(["true", "false"]).transform((value) => value === "true");

/** An IPv4 or IPv6 address, optionally with a prefix length that fits it (`10.0.0.0/8`). */
function isAddressOrSubnet(entry: string): boolean {
  const [address = "", prefix, ...rest] = entry.split("/");
  const version = isIP(address);
  if (version === 0 || rest.length > 0) return false;
  if (prefix === undefined) return true;
  const bits = Number(prefix);
  return /^\d{1,3}$/.test(prefix) && bits <= (version === 4 ? 32 : 128);
}

/**
 * `TRUST_PROXY`: how many proxy hops to trust (a whole number), or which proxies (a comma-separated
 * list of addresses and subnets). `true` and `*` are refused: trusting every hop lets a client
 * write its own address into X-Forwarded-For and dodge the per-IP rate limits (docs/deploy.md).
 */
const trustProxy = unsetIfEmpty(z.string().default("0")).transform((value, ctx) => {
  if (/^\d+$/.test(value.trim())) return Number(value);
  const entries = value.split(",").map((entry) => entry.trim());
  if (entries.every(isAddressOrSubnet)) return entries;
  ctx.addIssue({
    code: "custom",
    message: "must be a number of hops or a comma-separated list of addresses and subnets",
  });
  return z.NEVER;
});

const PRODUCTION_SECRETS = [
  "SESSION_SECRET",
  "CSRF_SECRET",
  "COACH_SHARED_SECRET",
  "PROXY_SHARED_SECRET",
] as const;

const envSchema = z
  .object({
    // Unset means production: development and test behaviour must be asked for.
    NODE_ENV: unsetIfEmpty(z.enum(["development", "test", "production"]).default("production")),
    PORT: port(4000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    TRUST_PROXY: trustProxy,
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
    PRACTICE_STUDENT_DAILY_TOKEN_LIMIT: integer(LIMITS.studentDailyTokenLimit),
    PRACTICE_RETENTION_DAYS: integer(LIMITS.attemptRetentionDays),
    HIBP_ENABLED: flag.default(true),
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
    if (env.TRUST_PROXY === 0) {
      // Behind the platform proxy the app sees plain http; without trusting it, Secure cookies
      // are never sent and nobody can stay signed in.
      ctx.addIssue({
        code: "custom",
        path: ["TRUST_PROXY"],
        message: "must be at least 1 in production",
      });
    }
    if (!env.SMTP_HOST) {
      ctx.addIssue({ code: "custom", path: ["SMTP_HOST"], message: "is required in production" });
    }
    if (!env.PROXY_SHARED_SECRET) {
      // Without it anyone who finds the api's URL can call it directly, around web.
      ctx.addIssue({
        code: "custom",
        path: ["PROXY_SHARED_SECRET"],
        message: "is required in production",
      });
    }
  })
  .transform((env) => ({ ...env, isProd: env.NODE_ENV === "production" }));

export type Config = z.output<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  return parseConfig(envSchema, env);
}
