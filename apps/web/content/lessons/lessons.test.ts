import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SKILL_SLUGS } from "@pitchperfect/shared";
import { describe, expect, it } from "vitest";

const DIR = import.meta.dirname;
const SECTIONS = [
  "Why it matters",
  "A simple framework",
  "Example",
  "Common mistakes",
  "Practice prompt",
];

const read = (slug: string) => readFileSync(join(DIR, `${slug}.mdx`), "utf8");

/** Words a reader sees: markdown syntax removed. */
const wordCount = (source: string) =>
  source
    .replace(/[#*_>`-]/g, " ")
    .split(/\s+/)
    .filter((word) => /\p{L}|\p{N}/u.test(word)).length;

describe("lessons", () => {
  it("has exactly one MDX file per skill", () => {
    const files = readdirSync(DIR)
      .filter((name) => name.endsWith(".mdx"))
      .sort();
    expect(files).toEqual(SKILL_SLUGS.map((slug) => `${slug}.mdx`).sort());
  });

  it.each(SKILL_SLUGS)("%s has the five sections, in order", (slug) => {
    const headings = [...read(slug).matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    expect(headings).toEqual(SECTIONS);
  });

  it.each(SKILL_SLUGS)("%s is 300–500 words", (slug) => {
    const words = wordCount(read(slug));
    expect(words).toBeGreaterThanOrEqual(300);
    expect(words).toBeLessThanOrEqual(500);
  });

  it.each(SKILL_SLUGS)(
    "%s is plain content: no frontmatter, imports, scripts or a title",
    (slug) => {
      const source = read(slug);
      expect(source.startsWith("---")).toBe(false);
      expect(source).not.toMatch(/^(import|export)\s/m);
      expect(source).not.toMatch(/<script|<style|\{/i);
      // The page shows the title from the shared SKILLS list.
      expect(source).not.toMatch(/^# /m);
    },
  );
});
