import type { Router } from "express";
import type { DestinationStream } from "pino";
import { createApp } from "../../src/app.js";
import { loadConfig, type Config } from "../../src/config.js";
import type { CoachClient } from "../../src/services/coach-client.js";
import { devEnv } from "./env.js";
import { FakeCoachClient } from "./fake-coach.js";
import { FakeMailer } from "./fake-mailer.js";

export interface TestAppOverrides {
  /** Environment variables layered over the default development environment. */
  env?: NodeJS.ProcessEnv;
  coach?: CoachClient;
  mailer?: FakeMailer;
  now?: () => Date;
  /** Registers test-only routes on the `/api` router, ahead of the not-found handler. */
  extraRoutes?: (router: Router) => void;
  /** Where the app's request logs go (default: stdout at the configured level). */
  logStream?: DestinationStream;
}

export function makeTestApp(overrides: TestAppOverrides = {}) {
  const config: Config = loadConfig(devEnv(overrides.env));
  const mailer = overrides.mailer ?? new FakeMailer();
  const coach = overrides.coach ?? new FakeCoachClient();
  const app = createApp(
    {
      config,
      coach,
      mailer,
      now: overrides.now ?? (() => new Date()),
      logStream: overrides.logStream,
    },
    overrides.extraRoutes,
  );
  return { app, config, mailer, coach };
}
