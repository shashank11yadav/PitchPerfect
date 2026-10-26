"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Heading3,
  Heading4,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  TextQuote,
  Underline,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/Button";
import { Field, FieldError, FieldHint, describedByIds } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { jobDescriptionExtensions, linkHref, linkPaste } from "@/lib/rich-text";

type ToolId =
  "bold" | "italic" | "underline" | "h3" | "h4" | "bulletList" | "orderedList" | "blockquote";

interface Tool {
  id: ToolId;
  label: string;
  icon: LucideIcon;
  /** The key after the modifier(s), as shown: "B" for Ctrl+B. */
  keys: string;
  shift?: boolean;
  alt?: boolean;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}

const chain = (editor: Editor) => editor.chain().focus();

const TOOLS: readonly Tool[] = [
  {
    id: "bold",
    label: "Bold",
    icon: Bold,
    keys: "B",
    isActive: (editor) => editor.isActive("bold"),
    run: (editor) => chain(editor).toggleBold().run(),
  },
  {
    id: "italic",
    label: "Italic",
    icon: Italic,
    keys: "I",
    isActive: (editor) => editor.isActive("italic"),
    run: (editor) => chain(editor).toggleItalic().run(),
  },
  {
    id: "underline",
    label: "Underline",
    icon: Underline,
    keys: "U",
    isActive: (editor) => editor.isActive("underline"),
    run: (editor) => chain(editor).toggleUnderline().run(),
  },
  {
    id: "h3",
    label: "Heading",
    icon: Heading3,
    keys: "3",
    alt: true,
    isActive: (editor) => editor.isActive("heading", { level: 3 }),
    run: (editor) => chain(editor).toggleHeading({ level: 3 }).run(),
  },
  {
    id: "h4",
    label: "Subheading",
    icon: Heading4,
    keys: "4",
    alt: true,
    isActive: (editor) => editor.isActive("heading", { level: 4 }),
    run: (editor) => chain(editor).toggleHeading({ level: 4 }).run(),
  },
  {
    id: "bulletList",
    label: "Bulleted list",
    icon: List,
    keys: "8",
    shift: true,
    isActive: (editor) => editor.isActive("bulletList"),
    run: (editor) => chain(editor).toggleBulletList().run(),
  },
  {
    id: "orderedList",
    label: "Numbered list",
    icon: ListOrdered,
    keys: "7",
    shift: true,
    isActive: (editor) => editor.isActive("orderedList"),
    run: (editor) => chain(editor).toggleOrderedList().run(),
  },
  {
    id: "blockquote",
    label: "Quote",
    icon: TextQuote,
    keys: "B",
    shift: true,
    isActive: (editor) => editor.isActive("blockquote"),
    run: (editor) => chain(editor).toggleBlockquote().run(),
  },
];

const LINK_TOOL = { label: "Link", keys: "K" } as const;

/** Apple keyboards say ⌘; everyone else says Ctrl. Read on the client only. */
function useApple(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => /Mac|iPhone|iPad/.test(navigator.userAgent),
    () => false,
  );
}

function shortcut(
  apple: boolean,
  { keys, shift = false, alt = false }: Pick<Tool, "keys" | "shift" | "alt">,
) {
  const shown = apple
    ? `${alt ? "⌥" : ""}${shift ? "⇧" : ""}⌘${keys}`
    : `Ctrl+${alt ? "Alt+" : ""}${shift ? "Shift+" : ""}${keys}`;
  const aria = `${apple ? "Meta" : "Control"}+${alt ? "Alt+" : ""}${shift ? "Shift+" : ""}${keys}`;
  return { shown, aria };
}

interface ToolButtonProps {
  label: string;
  hint: { shown: string; aria: string };
  icon: LucideIcon;
  pressed: boolean;
  disabled: boolean;
  onPress: () => void;
}

function ToolButton({ label, hint, icon: Icon, pressed, disabled, onPress }: ToolButtonProps) {
  const name = `${label} (${hint.shown})`;
  return (
    <button
      type="button"
      aria-label={name}
      title={name}
      aria-pressed={pressed}
      aria-keyshortcuts={hint.aria}
      disabled={disabled}
      // Keeps the editor's selection, so the format lands where the cursor was.
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={onPress}
      className={cn(
        "flex size-11 items-center justify-center rounded-control text-ink hover:bg-primary-soft",
        "aria-pressed:bg-primary-soft aria-pressed:text-primary disabled:opacity-50",
      )}
    >
      <Icon aria-hidden="true" className="size-4.5" />
    </button>
  );
}

/** Arrow keys move along the toolbar, as in the WAI-ARIA toolbar pattern. */
function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
  if (step === undefined) return;
  const buttons = Array.from(event.currentTarget.querySelectorAll("button:not([disabled])"));
  const focused = buttons.findIndex((button) => button === document.activeElement);
  const index = focused === -1 ? 0 : focused;
  const next = buttons[(index + step + buttons.length) % buttons.length];
  if (next instanceof HTMLElement) {
    event.preventDefault();
    next.focus();
  }
}

interface LinkBoxProps {
  editor: Editor;
  onDone: () => void;
}

/** Add, change or remove the link at the cursor. Only https and email links are taken. */
function LinkBox({ editor, onDone }: LinkBoxProps) {
  const saved: unknown = editor.getAttributes("link").href;
  const current = typeof saved === "string" ? saved : undefined;
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  // Keyboard users land in the box when it opens.
  useEffect(() => {
    input.current?.focus();
  }, []);

  function apply() {
    const result = linkHref(value);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    const { href } = result;
    const { empty } = editor.state.selection;
    if (empty && !current) {
      const text = href.replace(/^mailto:/, "");
      chain(editor)
        .insertContent({ type: "text", text, marks: [{ type: "link", attrs: { href } }] })
        .run();
    } else {
      chain(editor).extendMarkRange("link").setLink({ href }).run();
    }
    onDone();
  }

  return (
    <div
      role="group"
      aria-label="Link"
      className="flex flex-col gap-3 border-b border-border bg-surface-2 p-3 sm:flex-row sm:items-end"
    >
      <Field
        label="Link address"
        hint={error ? undefined : "A web address starting with https://, or an email address."}
        error={error}
        className="sm:flex-1"
      >
        <Input
          ref={input}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError("");
          }}
          inputMode="url"
          spellCheck={false}
          placeholder="https://"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              chain(editor).run();
              onDone();
            }
            if (event.key === "Enter") {
              // Enter adds the link here; it must not submit the job form around the editor.
              event.preventDefault();
              apply();
            }
          }}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={apply} className="h-11">
          {current ? "Update link" : "Add link"}
        </Button>
        {current && (
          <Button
            size="sm"
            variant="secondary"
            className="h-11"
            onClick={() => {
              chain(editor).extendMarkRange("link").unsetLink().run();
              onDone();
            }}
          >
            Remove link
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-11"
          onClick={() => {
            chain(editor).run();
            onDone();
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

interface RichTextEditorProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Starting HTML (already sanitized by the api when it comes from a saved job). */
  initialHtml?: string;
  /** The new HTML after every change; an empty editor reports "". */
  onChange: (html: string) => void;
}

/**
 * The job description editor: headings, lists, quotes, bold, italic, underline and links, and
 * nothing else, so what it puts out is exactly what the sanitizer keeps.
 */
export function RichTextEditor({
  label,
  hint,
  error,
  required = false,
  initialHtml = "",
  onChange,
}: RichTextEditorProps) {
  const id = useId();
  const apple = useApple();
  const [linking, setLinking] = useState(false);
  const [pasteProblem, setPasteProblem] = useState("");
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const describedBy = describedByIds({ id, hint, error });
  const attributes = {
    id,
    role: "textbox",
    "aria-multiline": "true",
    "aria-labelledby": `${id}-label`,
    ...(describedBy && { "aria-describedby": describedBy }),
    ...(error ? { "aria-invalid": "true" } : {}),
    ...(required && { "aria-required": "true" }),
    class: "pp-prose min-h-48 max-w-none px-3.5 py-3 focus:outline-none",
  };

  const editor = useEditor({
    extensions: jobDescriptionExtensions(),
    content: initialHtml,
    // The page renders on the server first; the editor only exists in the browser.
    immediatelyRender: false,
    editorProps: {
      attributes,
      handlePaste: linkPaste((reason) => {
        setPasteProblem(`That link wasn’t added. ${reason}`);
      }),
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          setLinking(true);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: current }) => {
      setPasteProblem("");
      onChangeRef.current(current.isEmpty ? "" : current.getHTML());
    },
  });

  // The error and hint come and go after the editor exists; keep its ARIA in step.
  const attributeKey = JSON.stringify(attributes);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: JSON.parse(attributeKey) as Record<string, string>,
      },
    });
  }, [editor, attributeKey]);

  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) return null;
      return {
        ...Object.fromEntries(TOOLS.map((tool) => [tool.id, tool.isActive(current)])),
        link: current.isActive("link"),
      } as Record<ToolId | "link", boolean>;
    },
  });

  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-small font-semibold text-ink">
        {label}
        {required && (
          <span aria-hidden="true" className="text-danger">
            {" *"}
          </span>
        )}
      </span>
      <FieldHint id={id} hint={hint} />
      <div
        className={cn(
          "overflow-hidden rounded-control border border-muted bg-surface",
          "focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2",
          error && "border-danger",
        )}
      >
        <div
          role="toolbar"
          aria-label="Formatting"
          aria-controls={id}
          onKeyDown={moveFocus}
          className="flex flex-wrap gap-0.5 border-b border-border bg-surface-2 p-1"
        >
          {TOOLS.map((tool) => (
            <ToolButton
              key={tool.id}
              label={tool.label}
              hint={shortcut(apple, tool)}
              icon={tool.icon}
              pressed={active?.[tool.id] ?? false}
              disabled={!editor}
              onPress={() => {
                if (editor) tool.run(editor);
              }}
            />
          ))}
          <ToolButton
            label={LINK_TOOL.label}
            hint={shortcut(apple, LINK_TOOL)}
            icon={LinkIcon}
            pressed={active?.link ?? false}
            disabled={!editor}
            onPress={() => {
              setLinking(true);
            }}
          />
        </div>
        {linking && editor && (
          <LinkBox
            editor={editor}
            onDone={() => {
              setLinking(false);
            }}
          />
        )}
        <EditorContent editor={editor} />
        <p role="alert" className="px-3.5 pb-3 text-small text-danger empty:sr-only">
          {pasteProblem}
        </p>
      </div>
      <FieldError id={id} error={error} />
    </div>
  );
}
