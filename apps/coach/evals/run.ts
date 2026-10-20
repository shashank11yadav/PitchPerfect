import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfigOrExit } from "@pitchperfect/shared/env";
import { loadCoachConfig } from "../src/config.js";
import { createProvider } from "../src/providers/index.js";
import { loadCases } from "./cases.js";
import { evalsPassed, formatReport } from "./report.js";
import { runEvals } from "./runner.js";

const RESULTS_DIR = fileURLToPath(new URL("./results", import.meta.url));

const write = (text: string) => process.stdout.write(`${text}\n`);

/** `--concurrency=<n>`; the runner's default applies when it is absent. */
function concurrencyArg(): number | undefined {
  const arg = process.argv.find((a) => a.startsWith("--concurrency="));
  if (arg === undefined) return undefined;
  const value = Number(arg.slice("--concurrency=".length));
  if (!Number.isInteger(value) || value < 1) {
    process.stderr.write("--concurrency must be a whole number of at least 1\n");
    process.exit(2);
  }
  return value;
}

const concurrency = concurrencyArg();
const env = loadConfigOrExit(() => loadCoachConfig(process.env));
if (env.COACH_PROVIDER === "fake") {
  process.stderr.write(
    "The evals measure real models. Set COACH_PROVIDER to openai or anthropic, together with " +
      "its API key, COACH_MODEL and COACH_SCORING_MODEL.\n",
  );
  process.exit(2);
}

// Request logs would bury the table; the report is the output.
const config = { ...env, LOG_LEVEL: "silent" as const };
const cases = loadCases();
write(`Running ${String(cases.length)} cases against ${config.COACH_PROVIDER}...`);

const report = await runEvals({ config, provider: createProvider(config), cases, concurrency });
write(formatReport(report));

mkdirSync(RESULTS_DIR, { recursive: true });
// Colons are not valid in file names on every system.
const file = path.join(RESULTS_DIR, `${new Date().toISOString().replaceAll(":", "-")}.json`);
writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
write(`Results written to ${path.relative(process.cwd(), file)}`);

process.exitCode = evalsPassed(report) ? 0 : 1;
