import { runCli } from "./cli.js";
import { runAdmin } from "./run-admin.js";

await runCli(() =>
  runAdmin(process.argv.slice(2), {
    out: (line) => {
      console.log(line);
    },
    err: (line) => {
      console.error(line);
    },
  }),
);
