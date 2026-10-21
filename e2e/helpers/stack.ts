/**
 * The local stack the e2e suite runs against: where each service listens, the throwaway database,
 * the Mailpit inbox, and the environment each service boots with. Every secret here is a
 * `dev-only-` placeholder, which the services refuse in production.
 */

/** 3000, unless `E2E_WEB_PORT` moves it (when another app already holds 3000). */
export const WEB_PORT = process.env.E2E_WEB_PORT ?? "3000";
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const API_URL = "http://localhost:4000";
export const COACH_URL = "http://127.0.0.1:4100";
export const MAILPIT_URL = "http://localhost:8025";
export const MONGO_URL = "mongodb://localhost:27017";
export const E2E_DATABASE = "pitchperfect-e2e";
const MONGODB_URI = `${MONGO_URL}/${E2E_DATABASE}`;

/** The seeded demo accounts' password in the e2e database, and of accounts the suite creates. */
export const E2E_PASSWORD = "dev-only-e2e-account-password";

const COACH_SHARED_SECRET = "dev-only-e2e-coach-shared-secret-0000000000";

export const COACH_ENV = {
  NODE_ENV: "development",
  PORT: "4100",
  LOG_LEVEL: "warn",
  COACH_PROVIDER: "fake",
  COACH_SHARED_SECRET,
};

export const API_ENV = {
  NODE_ENV: "development",
  PORT: "4000",
  LOG_LEVEL: "warn",
  APP_URL: WEB_URL,
  MONGODB_URI,
  SESSION_SECRET: "dev-only-e2e-session-secret-00000000000000",
  CSRF_SECRET: "dev-only-e2e-csrf-secret-000000000000000000",
  COACH_URL,
  COACH_SHARED_SECRET,
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  HIBP_ENABLED: "false",
  // A few runs a day must fit; the product default (5) is tested in the api's own suite.
  PRACTICE_DAILY_LIMIT: "50",
  PRACTICE_MONTHLY_LIMIT: "500",
  SEED_DEMO_PASSWORD: E2E_PASSWORD,
};

export const WEB_ENV = {
  API_ORIGIN: API_URL,
  SITE_URL: WEB_URL,
};
