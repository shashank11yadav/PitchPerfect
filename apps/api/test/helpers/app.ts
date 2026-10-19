import type { Router } from "express";
import { createApp } from "../../src/app.js";
import { loadConfig, type Config } from "../../src/config.js";
import { devEnv } from "./env.js";
import { FakeCoachClient } from "./fake-coach.js";
import { FakeMailer } from "./fake-mailer.js";

export interface TestAppOverrides {
  /** Environment variables layered over the default development environment. */
  env?: NodeJS.ProcessEnv;
  coach?: FakeCoachClient;
  mailer?: FakeMailer;
  now?: () => Date;
  /** Registers test-only routes on the `/api` router, ahead of the not-found handler. */
  extraRoutes?: (router: Router) => void;
}

export function makeTestApp(overrides: TestAppOverrides = {}) {
  const config: Config = loadConfig(devEnv(overrides.env));
  const mailer = overrides.mailer ?? new FakeMailer();
  const coach = overrides.coach ?? new FakeCoachClient();
  const app = createApp(
    { config, coach, mailer, now: overrides.now ?? (() => new Date()) },
    overrides.extraRoutes,
  );
  return { app, config, mailer, coach };
}
