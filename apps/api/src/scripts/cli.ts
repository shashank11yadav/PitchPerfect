import { ConfigError, loadConfig, type Config } from "../config.js";
import { connectDb, disconnectDb } from "../db/connect.js";
import { SeedError } from "./run-seed.js";

/** What to print for a failure: our own messages as they are, anything else by name and message. */
function describeFailure(error: unknown): string {
  if (error instanceof ConfigError || error instanceof SeedError) return error.message;
  const text = error instanceof Error ? `${error.name}: ${error.message}` : "Unexpected failure";
  const uri = process.env.MONGODB_URI;
  return uri ? text.replaceAll(uri, "[redacted]") : text;
}

/**
 * The shared shell of every script: read the environment, connect once, run `task`, disconnect,
 * and set the exit code (the task's own, or 1 on any failure).
 */
export async function runCli(task: (config: Config) => Promise<number>): Promise<void> {
  let exitCode = 1;
  try {
    const config = loadConfig(process.env);
    await connectDb(config.MONGODB_URI);
    try {
      exitCode = await task(config);
    } finally {
      await disconnectDb();
    }
  } catch (error) {
    console.error(describeFailure(error));
  }
  process.exitCode = exitCode;
}
