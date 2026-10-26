import { describe, expect, it } from "vitest";
import {
  JOB_HTML_LINK_ATTRIBUTES,
  JOB_HTML_LINK_SCHEMES,
  JOB_HTML_TAGS,
  JOB_HTML_SAFE_HREF,
} from "./html-allowlist.js";

describe("job HTML allowlist", () => {
  it("is the list in docs/security.md, with no tag that can run script or load anything", () => {
    expect([...JOB_HTML_TAGS].sort()).toEqual(
      ["a", "blockquote", "br", "em", "h3", "h4", "li", "ol", "p", "strong", "u", "ul"].sort(),
    );
    for (const tag of ["script", "img", "iframe", "style", "svg", "form", "span", "div"]) {
      expect(JOB_HTML_TAGS).not.toContain(tag);
    }
    expect(JOB_HTML_LINK_ATTRIBUTES).toEqual(["href", "rel", "target"]);
  });

  it("keeps absolute https and mailto links only", () => {
    for (const href of [
      "https://example.test/a",
      "HTTPS://example.test",
      "mailto:a@example.test",
    ]) {
      expect(JOB_HTML_SAFE_HREF.test(href)).toBe(true);
    }
    for (const href of [
      "http://example.test",
      "javascript:alert(1)",
      "data:text/html,x",
      "//example.test",
      "/jobs",
      "example.test",
      " https://example.test",
    ]) {
      expect(JOB_HTML_SAFE_HREF.test(href)).toBe(false);
    }
  });

  it("names the same schemes as the href test", () => {
    for (const scheme of JOB_HTML_LINK_SCHEMES) {
      expect(JOB_HTML_SAFE_HREF.test(`${scheme}:x`)).toBe(true);
    }
  });
});
