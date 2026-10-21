import { Editor } from "@tiptap/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { sanitizeJobHtml } from "@/lib/html-allowlist";
import { jobDescriptionExtensions, linkHref, linkPaste } from "@/lib/rich-text";
import { RichTextEditor } from "./RichTextEditor";

const editors: Editor[] = [];

// jsdom lays nothing out, so ranges have no boxes; ProseMirror asks for them when it scrolls the
// cursor into view after a command.
beforeAll(() => {
  const box = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  Range.prototype.getBoundingClientRect = () => ({ ...box, toJSON: () => box });
  Range.prototype.getClientRects = () => Object.assign([], { item: () => null });
});

/** The editor's HTML for some starting content, as `RichTextEditor` would send it. */
function roundTrip(content: string): string {
  const editor = new Editor({ extensions: jobDescriptionExtensions(), content });
  editors.push(editor);
  return editor.getHTML();
}

afterEach(() => {
  while (editors.length > 0) editors.pop()?.destroy();
});

describe("job description editor output", () => {
  it("passes the shared sanitizer unchanged for every allowed tag", () => {
    const html = roundTrip(
      [
        "<h3>What you’ll do</h3>",
        "<p>Open <strong>new</strong> conversations, <em>daily</em>, <u>by phone</u>.<br>Then follow up.</p>",
        "<ul><li><p>Book first calls</p></li></ul>",
        "<ol><li><p>Write notes</p></li></ol>",
        "<h4>Who you are</h4>",
        "<blockquote><p>Curious and direct.</p></blockquote>",
        '<p>Questions: <a href="mailto:jobs@pitchwell-demo.example">email us</a> or read <a href="https://pitchwell-demo.example/about">about us</a>.</p>',
      ].join(""),
    );
    for (const tag of [
      "<h3>",
      "<strong>",
      "<em>",
      "<u>",
      "<br>",
      "<ul>",
      "<ol>",
      "<h4>",
      "<blockquote>",
    ]) {
      expect(html).toContain(tag);
    }
    expect(html).toContain('href="https://pitchwell-demo.example/about"');
    expect(html).toContain('href="mailto:jobs@pitchwell-demo.example"');
    expect(sanitizeJobHtml(html)).toBe(html);
  });

  it("drops what the allowlist doesn't allow and keeps the words", () => {
    const html = roundTrip(
      [
        "<h1>Big title</h1>",
        "<h2>Second</h2>",
        '<p style="color:red" class="x" onclick="alert(1)">Styled <code>code</code> and <s>struck</s></p>',
        '<img src="https://evil.example/x.png" onerror="alert(1)">',
        "<script>alert(1)</script>",
        "<pre><code>block</code></pre>",
        "<hr>",
        '<p><a href="javascript:alert(1)">bad link</a> <a href="http://plain.example">plain</a></p>',
        '<table><tr><td>cell</td></tr></table><iframe src="https://evil.example"></iframe>',
      ].join(""),
    );
    for (const banned of [
      "<h1",
      "<h2",
      "style=",
      "class=",
      "onclick",
      "<code",
      "<s>",
      "<img",
      "<script",
      "<pre",
      "<hr",
      "javascript:",
      "http://",
      "<table",
      "<iframe",
    ]) {
      expect(html).not.toContain(banned);
    }
    for (const words of [
      "Big title",
      "Second",
      "Styled",
      "code",
      "struck",
      "bad link",
      "plain",
      "cell",
    ]) {
      expect(html).toContain(words);
    }
    expect(sanitizeJobHtml(html)).toBe(html);
  });
});

/** Pastes `text` as plain text over "Apply here", selected, the way a browser would. */
function pasteOverSelection(editor: Editor, text: string) {
  editor.commands.setTextSelection({ from: 1, to: 11 });
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData: (type: string) => (type === "text/plain" ? text : ""),
      types: ["text/plain"],
      files: [],
    },
  });
  editor.view.dom.dispatchEvent(event);
}

describe("pasting a link over a selection", () => {
  function pasteEditor() {
    const refused = vi.fn();
    const editor = new Editor({
      extensions: jobDescriptionExtensions(),
      content: "<p>Apply here</p>",
      editorProps: { handlePaste: linkPaste(refused) },
    });
    editors.push(editor);
    return { editor, refused };
  }

  it("never links a pasted address on its own, even without the editor's paste rule", () => {
    const editor = new Editor({
      extensions: jobDescriptionExtensions(),
      content: "<p>Apply here</p>",
    });
    editors.push(editor);
    pasteOverSelection(editor, "http://pitchwell-demo.example/apply");
    expect(editor.getHTML()).not.toContain("<a");
  });

  it.each([
    ["http://pitchwell-demo.example/apply", "Use a link that starts with https://."],
    ["https://user:pw@pitchwell-demo.example", "Links with a username or password can’t be used."],
    ["javascript:alert(1)", "Use a link that starts with https:// or an email address."],
  ])("refuses %j with the link box's reason and leaves the words alone", (text, reason) => {
    const { editor, refused } = pasteEditor();
    pasteOverSelection(editor, text);
    expect(refused).toHaveBeenCalledWith(reason);
    expect(editor.getHTML()).toBe("<p>Apply here</p>");
  });

  it("links the selection to a pasted https address", () => {
    const { editor, refused } = pasteEditor();
    pasteOverSelection(editor, "https://pitchwell-demo.example/apply");
    expect(refused).not.toHaveBeenCalled();
    expect(editor.getHTML()).toBe(
      '<p><a href="https://pitchwell-demo.example/apply" rel="noopener noreferrer nofollow" target="_blank">Apply here</a></p>',
    );
  });

  it.each(["Send us a note", "Note:", "Re:pricing"])("pastes %j as words", (text) => {
    const { editor, refused } = pasteEditor();
    pasteOverSelection(editor, text);
    expect(refused).not.toHaveBeenCalled();
    expect(editor.getHTML()).toBe(`<p>${text}</p>`);
  });
});

describe("linkHref", () => {
  it.each([
    ["https://pitchwell-demo.example/careers", "https://pitchwell-demo.example/careers"],
    ["  https://pitchwell-demo.example  ", "https://pitchwell-demo.example/"],
    ["mailto:jobs@pitchwell-demo.example", "mailto:jobs@pitchwell-demo.example"],
    ["jobs@pitchwell-demo.example", "mailto:jobs@pitchwell-demo.example"],
    ["pitchwell-demo.example/careers", "https://pitchwell-demo.example/careers"],
  ])("takes %j as %j", (input, href) => {
    expect(linkHref(input)).toEqual({ href });
  });

  it.each([
    ["", "Enter a link."],
    ["http://pitchwell-demo.example", "Use a link that starts with https://."],
    ["javascript:alert(1)", "Use a link that starts with https:// or an email address."],
    ["ftp://files.example", "Use a link that starts with https:// or an email address."],
    [
      "https://user:secret@pitchwell-demo.example",
      "Links with a username or password can’t be used.",
    ],
    ["not a link", "That doesn’t look like a web address or an email address."],
    ["mailto:", "That doesn’t look like a web address or an email address."],
    ["mailto:%E0%A4%A", "That doesn’t look like a web address or an email address."],
  ])("refuses %j", (input, error) => {
    expect(linkHref(input)).toEqual({ error });
  });
});

describe("RichTextEditor", () => {
  function setup(initialHtml = "<p>Open conversations.</p>") {
    const onChange = vi.fn();
    render(
      <RichTextEditor label="Job description" initialHtml={initialHtml} onChange={onChange} />,
    );
    return { onChange };
  }

  it("labels the editable region and every toolbar button", async () => {
    setup();
    const box = await screen.findByRole("textbox", { name: "Job description" });
    expect(box).toHaveAttribute("aria-multiline", "true");
    expect(box).toHaveAttribute("contenteditable", "true");
    const toolbar = screen.getByRole("toolbar", { name: "Formatting" });
    for (const name of [
      "Bold",
      "Italic",
      "Underline",
      "Heading",
      "Subheading",
      "Bulleted list",
      "Numbered list",
      "Quote",
      "Link",
    ]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${name}`) })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
    expect(toolbar).toContainElement(screen.getByRole("button", { name: /^Bold/ }));
    expect(screen.getByRole("button", { name: /^Bold/ })).toHaveAccessibleName(/Ctrl\+B|⌘B/);
  });

  it("presses a mark button and reports the new HTML", async () => {
    const { onChange } = setup("<p>Book first calls</p>");
    await screen.findByRole("textbox", { name: "Job description" });
    await userEvent.click(screen.getByRole("button", { name: /^Bulleted list/ }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Bulleted list/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
    expect(onChange).toHaveBeenLastCalledWith("<ul><li><p>Book first calls</p></li></ul>");
  });

  it("turns a paragraph into a section heading", async () => {
    const { onChange } = setup("<p>x</p>");
    await screen.findByRole("textbox", { name: "Job description" });
    await userEvent.click(screen.getByRole("button", { name: /^Heading/ }));
    expect(onChange).toHaveBeenLastCalledWith("<h3>x</h3>");
  });

  it("refuses a link that isn't https or an email and says why", async () => {
    setup();
    await screen.findByRole("textbox", { name: "Job description" });
    await userEvent.click(screen.getByRole("button", { name: /^Link/ }));
    const field = screen.getByRole("textbox", { name: "Link address" });
    await userEvent.type(field, "http://pitchwell-demo.example");
    await userEvent.click(screen.getByRole("button", { name: "Add link" }));
    expect(field).toHaveAccessibleDescription(/Use a link that starts with https:\/\//);
    expect(field).toHaveAttribute("aria-invalid", "true");
  });
});
