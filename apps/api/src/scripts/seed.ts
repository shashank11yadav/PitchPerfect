import { runCli } from "./cli.js";
import { DEMO_EMPLOYER_EMAIL, DEMO_STUDENT_EMAIL } from "./demo-data.js";
import { runSeed } from "./run-seed.js";

const flags = process.argv.slice(2);
const demo = flags.includes("--demo");

await runCli(async (config) => {
  if (flags.some((flag) => flag !== "--demo")) {
    console.error("Usage: npm run seed -- [--demo]");
    return 1;
  }
  const result = await runSeed({
    demo,
    password: config.SEED_DEMO_PASSWORD,
    retentionDays: config.PRACTICE_RETENTION_DAYS,
  });
  for (const [name, { created, existing }] of Object.entries(result)) {
    console.log(`${name}: ${String(created)} created, ${String(existing)} already there`);
  }
  if (demo) {
    console.log(
      `Demo accounts: ${DEMO_STUDENT_EMAIL}, ${DEMO_EMPLOYER_EMAIL} (password: SEED_DEMO_PASSWORD)`,
    );
  }
  return 0;
});
