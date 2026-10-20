import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EvalCaseSchema, type EvalCase } from "./case-schema.js";

export const CASES_DIR = fileURLToPath(new URL("./cases", import.meta.url));

/** Reads and validates every `<id>.json` in a directory, in file-name order. */
export function loadCases(dir: string = CASES_DIR): EvalCase[] {
  const cases = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const parsed = EvalCaseSchema.safeParse(
        JSON.parse(readFileSync(path.join(dir, name), "utf8")) as unknown,
      );
      if (!parsed.success) {
        const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
        throw new Error(`${name} is not a valid eval case: ${problems.join("; ")}`);
      }
      if (`${parsed.data.id}.json` !== name) {
        throw new Error(`${name} must be named after its id (${parsed.data.id})`);
      }
      return parsed.data;
    });
  return cases;
}
