import { describe, expect, it } from "vitest";
import { htmlToText, truncateText } from "./plain-text";

describe("htmlToText", () => {
  it("drops tags, keeps the words apart, and decodes common entities", () => {
    expect(
      htmlToText(
        "<p>Book <strong>first</strong> calls.</p><ul><li>Q&amp;A</li><li>&lt;3&nbsp;days</li></ul>",
      ),
    ).toBe("Book first calls. Q&A <3 days");
  });

  it("decodes numeric entities and leaves unknown ones alone", () => {
    expect(htmlToText("It&#39;s &#x2014; &bogus; done")).toBe("It's — &bogus; done");
  });

  it("removes the contents of script and style blocks", () => {
    expect(htmlToText("<p>Hi</p><script>alert(1)</script><style>p{}</style>")).toBe("Hi");
  });
});

describe("truncateText", () => {
  it("leaves short text alone", () => {
    expect(truncateText("Short and sweet.", 155)).toBe("Short and sweet.");
  });

  it("cuts at a word boundary and adds an ellipsis within the limit", () => {
    const text = "word ".repeat(60).trim();
    const cut = truncateText(text, 155);
    expect(cut.length).toBeLessThanOrEqual(155);
    expect(cut.endsWith("word…")).toBe(true);
  });
});
