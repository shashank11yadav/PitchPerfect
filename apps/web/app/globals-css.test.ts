import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(import.meta.dirname, "globals.css"), "utf8");

describe("globals.css", () => {
  it("keeps focused fields clear of the sticky bars when the browser scrolls to them", () => {
    expect(css).toMatch(/html\s*\{[^}]*scroll-padding-top:\s*5rem/);
  });
});
