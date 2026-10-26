import { JOB_HTML_LINK_REL } from "@pitchperfect/shared";
import { Link } from "@tiptap/extension-link";
import type { EditorView } from "@tiptap/pm/view";
import { StarterKit } from "@tiptap/starter-kit";

/**
 * The job description editor's schema. It has exactly the nodes and marks of the shared HTML
 * allowlist (`html-allowlist.ts` in `@pitchperfect/shared`, docs/security.md "Stored XSS"): p,
 * br, strong, em, u, ul, ol, li, h3, h4, blockquote and https/mailto links. Anything else, typed,
 * pasted or loaded, has no place in the schema, so it never reaches the HTML the editor puts out.
 * The api sanitizes again.
 */

const NOT_A_LINK = "That doesn’t look like a web address or an email address.";
const ONLY_HTTPS = "Use a link that starts with https://.";
const HTTPS_OR_EMAIL = "Use a link that starts with https:// or an email address.";
const NO_CREDENTIALS = "Links with a username or password can’t be used.";

const BARE_EMAIL = /^[^\s@:/]+@[^\s@:/]+\.[^\s@:/]+$/;
const BARE_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+(?:[/?#]\S*)?$/i;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Percent-decoded, or "" when the escapes are broken (`%E0%A4%A`). */
function decoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

/**
 * What an employer typed into the link box, as a link the allowlist keeps (`{ href }`), or the
 * reason it can't be one (`{ error }`). A bare email becomes `mailto:`, a bare domain `https://`.
 */
export function linkHref(input: string): { href: string } | { error: string } {
  const value = input.trim();
  if (value === "") return { error: "Enter a link." };
  if (BARE_EMAIL.test(value)) return { href: `mailto:${value}` };
  if (!SCHEME.test(value)) {
    return BARE_DOMAIN.test(value) ? linkHref(`https://${value}`) : { error: NOT_A_LINK };
  }
  if (!URL.canParse(value)) return { error: NOT_A_LINK };
  const url = new URL(value);
  if (url.protocol === "mailto:") {
    return BARE_EMAIL.test(decoded(url.pathname)) ? { href: value } : { error: NOT_A_LINK };
  }
  if (url.protocol === "http:") return { error: ONLY_HTTPS };
  if (url.protocol !== "https:") return { error: HTTPS_OR_EMAIL };
  if (url.username !== "" || url.password !== "") return { error: NO_CREDENTIALS };
  return url.hostname.includes(".") ? { href: url.href } : { error: NOT_A_LINK };
}

/** Pasted and loaded links are held to the same rule as typed ones. */
const isAllowedHref = (href: string) => "href" in linkHref(href) && SCHEME.test(href.trim());

/**
 * A scheme someone means as an address: anything followed by `//`, or one of the schemes used
 * without it. Plain words with a colon ("Note:", "Re:pricing") don't count.
 */
const LINK_SCHEME =
  /^(?:[a-z][a-z0-9+.-]*:\/\/|(?:mailto|javascript|vbscript|data|tel|sms|file|blob):)/i;

/** One word that is plainly meant as an address: it has a link scheme, or is a bare email or domain. */
const looksLikeLink = (text: string) =>
  /^\S+$/.test(text) && (LINK_SCHEME.test(text) || BARE_EMAIL.test(text) || BARE_DOMAIN.test(text));

/**
 * Paste handling for the editor (`editorProps.handlePaste`): an address pasted over selected
 * words links them when `linkHref` takes it, and otherwise leaves the words alone and reports
 * the same reason the link box gives. Every other paste goes ahead as usual.
 */
export function linkPaste(onRefused: (reason: string) => void) {
  return (view: EditorView, event: ClipboardEvent): boolean => {
    const { from, to, empty } = view.state.selection;
    const text = event.clipboardData?.getData("text/plain").trim() ?? "";
    if (empty || !looksLikeLink(text)) return false;
    const result = linkHref(text);
    if ("error" in result) {
      onRefused(result.error);
      return true;
    }
    const link = view.state.schema.marks.link;
    if (!link) return false;
    view.dispatch(view.state.tr.addMark(from, to, link.create({ href: result.href })));
    return true;
  };
}

export function jobDescriptionExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [3, 4] },
      code: false,
      codeBlock: false,
      horizontalRule: false,
      strike: false,
      dropcursor: false,
      trailingNode: false,
      // Configured below, on its own, so its rules sit in one place.
      link: false,
    }),
    Link.extend({
      // href, rel, target in the sanitizer's own order, so saved HTML round-trips unchanged.
      renderHTML({ HTMLAttributes }) {
        const href = typeof HTMLAttributes.href === "string" ? HTMLAttributes.href : "";
        return [
          "a",
          { href: isAllowedHref(href) ? href : "", rel: JOB_HTML_LINK_REL, target: "_blank" },
          0,
        ];
      },
    }).configure({
      protocols: ["https", "mailto"],
      defaultProtocol: "https",
      autolink: false,
      // Tiptap's own paste rule doesn't check the address; `linkPaste` does it instead.
      linkOnPaste: false,
      shouldAutoLink: isAllowedHref,
      openOnClick: false,
      isAllowedUri: isAllowedHref,
    }),
  ];
}
