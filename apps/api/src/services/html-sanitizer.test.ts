import { describe, expect, it } from "vitest";
import { htmlToPlainText, sanitizeJobHtml } from "./html-sanitizer.js";

describe("sanitizeJobHtml", () => {
  it("strips scripts, event handlers, iframes, and inline styles", () => {
    const dirty =
      '<p style="color:red" onclick="x()">Hi</p><script>alert(1)</script>' +
      '<img src="x" onerror="alert(1)"><iframe src="https://evil.example"></iframe>';
    const clean = sanitizeJobHtml(dirty);
    expect(clean).toBe("<p>Hi</p>");
  });

  it("unwraps links that aren't https or mailto (schemes, relative paths, fragments) but keeps the text", () => {
    for (const href of [
      "javascript:alert(1)",
      "data:text/html,x",
      "http://plain.example",
      "//x.example",
      "/path",
      "evil.test",
      "#x",
      "  javascript:alert(1)",
      "",
    ]) {
      const clean = sanitizeJobHtml(`<a href="${href}">link</a>`);
      expect(clean).toBe("link");
      expect(clean).toContain("link");
    }
  });

  it("keeps the allowed tags", () => {
    const html =
      "<h3>A</h3><h4>B</h4><p>x<br />y <strong>s</strong> <em>e</em> <u>u</u></p>" +
      "<ul><li>one</li></ul><ol><li>two</li></ol><blockquote>q</blockquote>";
    expect(sanitizeJobHtml(html)).toBe(html);
  });

  it("forces rel and target on https and mailto links", () => {
    const clean = sanitizeJobHtml(
      '<a href="https://ok.example/a" target="_self" rel="opener">x</a><a href="mailto:hr@ok.example">m</a>',
    );
    expect(clean).toBe(
      '<a href="https://ok.example/a" rel="noopener noreferrer nofollow" target="_blank">x</a>' +
        '<a href="mailto:hr@ok.example" rel="noopener noreferrer nofollow" target="_blank">m</a>',
    );
  });

  it("removes tags that are not on the allowlist but keeps their text", () => {
    expect(sanitizeJobHtml("<div><h1>Big</h1><span>small</span></div>")).toBe("Bigsmall");
  });

  it("is idempotent", () => {
    const once = sanitizeJobHtml('<p>a</p><a href="https://ok.example">x</a><script>1</script>');
    expect(sanitizeJobHtml(once)).toBe(once);
  });
});

describe("htmlToPlainText", () => {
  it("strips tags, decodes entities, and collapses whitespace", () => {
    expect(htmlToPlainText("<p>Fish &amp; chips</p>\n\n<ul><li>one</li><li>two</li></ul>")).toBe(
      "Fish & chips one two",
    );
  });

  it("separates block elements and drops script content", () => {
    expect(htmlToPlainText("<h3>Title</h3><p>a<br>b</p><script>evil()</script>")).toBe("Title a b");
  });

  it("stays fast on input with many unterminated tags", () => {
    const started = performance.now();
    htmlToPlainText("<p".repeat(50_000));
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("decodes entities once", () => {
    expect(htmlToPlainText("<p>&lt;b&gt; &quot;q&quot; &amp;lt; &nbsp;x</p>")).toBe(
      '<b> "q" &lt; x',
    );
  });
});
