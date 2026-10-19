import { runCli } from "./cli.js";
import { runPurge } from "./run-purge.js";

await runCli(async () => {
  const result = await runPurge(new Date());
  console.log(`Expired attempts deleted: ${String(result.attemptsDeleted)}`);
  console.log(`Expired or used tokens deleted: ${String(result.tokensDeleted)}`);
  console.log(`Stale active attempts abandoned: ${String(result.attemptsAbandoned)}`);
  console.log(`Applications detached from deleted attempts: ${String(result.sharesCleared)}`);
  return 0;
});
