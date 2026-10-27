// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = import.meta.dirname;
/** Source the browser runs; build output, dependencies and tests are left out. */
const SKIP = new Set(["node_modules", ".next", "out", "public", "scripts"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("back/forward cache", () => {
  it("has no unload handler anywhere, which would keep every page out of it", () => {
    const offenders = sourceFiles(ROOT).filter((file) =>
      /addEventListener\(\s*["']unload["']|\bonunload\b|\bonUnload\b/.test(
        readFileSync(file, "utf8"),
      ),
    );
    expect(offenders.map((file) => relative(ROOT, file))).toEqual([]);
  });
});
