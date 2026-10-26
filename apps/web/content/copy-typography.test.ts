import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/*
 * Rendered copy uses curly apostrophes and quotes (’ “ ”), never the straight ones or their HTML
 * entities. This reads every string and JSX text in the web app's source, so comments and code
 * are left alone, plus the lesson prose. Tests are skipped: they type what a person would type.
 */

const WEB = join(import.meta.dirname, "..");
const SOURCE_DIRS = ["app", "components", "content", "lib"];

/** A straight apostrophe inside a word ("don't"), or an apostrophe or quote entity. */
const STRAIGHT = /\p{L}'\p{L}|&apos;|&#39;|&rsquo;|&lsquo;|&ldquo;|&rdquo;|&quot;/u;

const COPY_NODES = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.JsxText,
]);

function sourceFiles(extension: RegExp): string[] {
  return SOURCE_DIRS.flatMap((dir) =>
    readdirSync(join(WEB, dir), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && extension.test(entry.name))
      .filter((entry) => !/\.test\.tsx?$/.test(entry.name))
      .map((entry) => join(entry.parentPath, entry.name)),
  );
}

/** "file:line  text" for every string or JSX text in `file` with straight typography. */
function straightCopy(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (COPY_NODES.has(node.kind)) {
      const literal = node.getText(source);
      if (STRAIGHT.test(literal)) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        found.push(`${relative(WEB, file)}:${String(line + 1)}  ${literal.trim().slice(0, 80)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("copy typography", () => {
  it("uses curly apostrophes and quotes in every string the web app renders", () => {
    expect(sourceFiles(/\.tsx?$/).flatMap(straightCopy)).toEqual([]);
  });

  it("uses curly apostrophes in the lessons", () => {
    const lessons = sourceFiles(/\.mdx$/).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          STRAIGHT.test(line) ? [`${relative(WEB, file)}:${String(index + 1)}  ${line}`] : [],
        ),
    );
    expect(lessons).toEqual([]);
  });

  it("catches a straight apostrophe in a string or in JSX text, but not in a comment", () => {
    const file = join(WEB, "content", "copy-typography.test.ts");
    expect(STRAIGHT.test("We couldn't load it")).toBe(true);
    expect(STRAIGHT.test("We couldn’t load it")).toBe(false);
    expect(STRAIGHT.test("We couldn&apos;t load it")).toBe(true);
    // The two strings just above, and none of the comments in this file (don't, "don't").
    const found = straightCopy(file);
    expect(found).toHaveLength(2);
    expect(found.every((line) => line.includes("We couldn"))).toBe(true);
  });
});
