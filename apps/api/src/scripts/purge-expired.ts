import { runCli } from "./cli.js";
import { runPurge } from "./run-purge.js";

await runCli(async () => {
  const result = await runPurge(new Date());
  console.log(`Expired attempts deleted: ${String(result.attemptsDeleted)}`);
  console.log(`Expired or used tokens deleted: ${String(result.tokensDeleted)}`);
  console.log(`Stale active attempts abandoned: ${String(result.attemptsAbandoned)}`);
  console.log(`Applications detached from deleted attempts: ${String(result.sharesCleared)}`);
  console.log(`Unfinished session starts removed: ${String(result.placeholdersDeleted)}`);
  console.log(
    `Résumé copies past the employer access window removed: ${String(result.resumesRemoved)}`,
  );
  return 0;
});
