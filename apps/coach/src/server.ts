import { loadConfigOrExit } from "@pitchperfect/shared/env";
import { buildCoachApp } from "./app.js";
import { loadCoachConfig } from "./config.js";

const config = loadConfigOrExit(() => loadCoachConfig(process.env));
const app = buildCoachApp({ config });

function shutdown(signal: string): void {
  app.log.info({ signal }, "shutting down");
  app.close().then(
    () => process.exit(0),
    () => process.exit(1),
  );
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  shutdown("SIGINT");
});

try {
  await app.listen({ host: config.HOST, port: config.PORT });
  app.log.info(
    { port: config.PORT, env: config.NODE_ENV, provider: config.COACH_PROVIDER },
    "coach listening",
  );
} catch (error) {
  app.log.fatal({ err: error }, "could not start");
  process.exit(1);
}
