import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SafeHtml } from "./SafeHtml";

function renderHtml(html: string): HTMLElement {
  const { container } = render(<SafeHtml html={html} />);
  return container.firstElementChild as HTMLElement;
}

describe("SafeHtml", () => {
  it("removes <script> elements", () => {
    const root = renderHtml("<p>Hello</p><script>alert(1)</script>");
    expect(root.querySelector("script")).toBeNull();
    expect(root.innerHTML).not.toContain("alert");
    expect(root).toHaveTextContent("Hello");
  });

  it("removes event handler attributes such as onerror", () => {
    const root = renderHtml('<p onclick="alert(1)">Hi</p><img src="x" onerror="alert(1)">');
    expect(root.innerHTML).not.toMatch(/onerror|onclick|<img/i);
    expect(root.querySelector("p")).toHaveTextContent("Hi");
  });

  it("keeps only the allowlisted tags", () => {
    const root = renderHtml(
      "<h3>Role</h3><p><strong>Bold</strong> <em>it</em> <u>u</u></p><ul><li>a</li></ul><blockquote>q</blockquote><div><iframe></iframe><style>p{}</style>text</div>",
    );
    expect(root.querySelector("h3,strong,em,u,ul,li,blockquote")).not.toBeNull();
    expect(root.querySelector("div,iframe,style")).toBeNull();
    expect(root).toHaveTextContent("text");
  });

  it("keeps https and mailto links and forces rel and target", () => {
    const root = renderHtml(
      '<a href="https://example.com/jobs" rel="opener" target="_self" class="x">Jobs</a> <a href="mailto:hiring@example.com">Mail</a>',
    );
    const links = root.querySelectorAll("a");
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).not.toHaveAttribute("class");
    }
  });

  it("drops javascript:, http:, and relative links but keeps their text", () => {
    const root = renderHtml(
      '<a href="javascript:alert(1)">one</a> <a href="http://example.com">two</a> <a href="/signin">three</a> <a>four</a>',
    );
    expect(root.querySelector("a")).toBeNull();
    expect(root).toHaveTextContent("one two three four");
  });
});
