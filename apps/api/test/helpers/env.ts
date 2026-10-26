/** Complete, valid development environment built in code. Placeholders only; no real secrets. */
export function devEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "development",
    PORT: "4000",
    LOG_LEVEL: "silent",
    TRUST_PROXY: "0",
    APP_URL: "http://localhost:3000",
    MONGODB_URI: "mongodb://localhost:27017/pitchperfect",
    SESSION_SECRET: "dev-only-session-secret-for-tests-0000000000000000",
    CSRF_SECRET: "dev-only-csrf-secret-for-tests-000000000000000000",
    COACH_URL: "http://localhost:4100",
    COACH_SHARED_SECRET: "dev-only-coach-shared-secret-for-tests-0000000",
    PROXY_SHARED_SECRET: "",
    SMTP_HOST: "localhost",
    SMTP_PORT: "1025",
    SMTP_SECURE: "false",
    SMTP_USER: "",
    SMTP_PASS: "",
    MAIL_FROM: "PitchPerfect <no-reply@pitchperfect.local>",
    PRACTICE_DAILY_LIMIT: "5",
    PRACTICE_MONTHLY_LIMIT: "30",
    PRACTICE_DAILY_TOKEN_BUDGET: "2000000",
    PRACTICE_STUDENT_DAILY_TOKEN_LIMIT: "250000",
    PRACTICE_RETENTION_DAYS: "180",
    HIBP_ENABLED: "false",
    SEED_DEMO_PASSWORD: "",
    ...overrides,
  };
}

/** `PROXY_SHARED_SECRET` of `prodEnv`: production requests send it as `x-pp-proxy`. */
export const PROD_PROXY_SECRET = "p".repeat(48);

/**
 * Valid production environment: https APP_URL, SMTP host, one trusted proxy, a proxy secret, and
 * no development placeholder secrets.
 */
export function prodEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return devEnv({
    NODE_ENV: "production",
    TRUST_PROXY: "1",
    APP_URL: "https://pitchperfect.example.com",
    SMTP_HOST: "smtp.example.com",
    SESSION_SECRET: "s".repeat(48),
    CSRF_SECRET: "c".repeat(48),
    COACH_SHARED_SECRET: "k".repeat(48),
    PROXY_SHARED_SECRET: PROD_PROXY_SECRET,
    ...overrides,
  });
}
