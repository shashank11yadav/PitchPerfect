import { createApp } from "./app.js";
import { ConfigError, loadConfig } from "./config.js";
import { connectDb, disconnectDb } from "./db/connect.js";
import { createLogger } from "./logger.js";
import { createHttpCoachClient } from "./services/coach-client.js";

const SHUTDOWN_GRACE_MS = 10_000;

function loadConfigOrExit() {
  try {
    return loadConfig(process.env);
  } catch (error) {
    // The logger needs a valid config, so configuration problems go straight to stderr.
    const message = error instanceof ConfigError ? error.message : "Could not read configuration";
    process.stderr.write(`${message}\n`);
    return process.exit(1);
  }
}

const config = loadConfigOrExit();
const logger = createLogger(config.LOG_LEVEL);

try {
  await connectDb(config.MONGODB_URI);
} catch (error) {
  logger.fatal({ err: error }, "could not connect to MongoDB");
  process.exit(1);
}

const app = createApp({ config, coach: createHttpCoachClient(config.COACH_URL) });
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, "api listening");
});

function shutdown(signal: string): void {
  logger.info({ signal }, "shutting down");
  setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS).unref();
  server.close(() => {
    disconnectDb().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  shutdown("SIGINT");
});
