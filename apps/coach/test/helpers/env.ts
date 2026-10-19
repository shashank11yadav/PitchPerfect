/** Complete, valid development environment built in code. Placeholders only; no real secrets. */
export function devEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    PORT: "4100",
    LOG_LEVEL: "silent",
    COACH_SHARED_SECRET: "dev-only-coach-shared-secret-for-tests-0000000",
    COACH_PROVIDER: "fake",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    COACH_MODEL: "",
    COACH_SCORING_MODEL: "",
    COACH_TIMEOUT_MS: "30000",
    ...overrides,
  };
}

/** Valid production environment: a real-looking secret and an explicitly chosen (fake) provider. */
export function prodEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return devEnv({ NODE_ENV: "production", COACH_SHARED_SECRET: "k".repeat(48), ...overrides });
}
