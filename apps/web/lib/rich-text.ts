import { Link } from "@tiptap/extension-link";
import { StarterKit } from "@tiptap/starter-kit";

/**
 * The job description editor's schema. It has exactly the nodes and marks of the shared HTML
 * allowlist (`html-allowlist.ts`, docs/security.md "Stored XSS"): p, br, strong, em, u, ul, ol,
 * li, h3, h4, blockquote and https/mailto links. Anything else, typed, pasted or loaded, has no
 * place in the schema, so it never reaches the HTML the editor puts out. The api sanitizes again.
 */

const LINK_REL = "noopener noreferrer nofollow";

const NOT_A_LINK = "That doesn’t look like a web address or an email address.";
const ONLY_HTTPS = "Use a link that starts with https://.";
const HTTPS_OR_EMAIL = "Use a link that starts with https:// or an email address.";
const NO_CREDENTIALS = "Links with a username or password can’t be used.";

const BARE_EMAIL = /^[^\s@:/]+@[^\s@:/]+\.[^\s@:/]+$/;
const BARE_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+(?:[/?#]\S*)?$/i;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

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
    return BARE_EMAIL.test(decodeURIComponent(url.pathname))
      ? { href: value }
      : { error: NOT_A_LINK };
  }
  if (url.protocol === "http:") return { error: ONLY_HTTPS };
  if (url.protocol !== "https:") return { error: HTTPS_OR_EMAIL };
  if (url.username !== "" || url.password !== "") return { error: NO_CREDENTIALS };
  return url.hostname.includes(".") ? { href: url.href } : { error: NOT_A_LINK };
}

/** Pasted and loaded links are held to the same rule as typed ones. */
const isAllowedHref = (href: string) => "href" in linkHref(href) && SCHEME.test(href.trim());

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
        return ["a", { href: isAllowedHref(href) ? href : "", rel: LINK_REL, target: "_blank" }, 0];
      },
    }).configure({
      protocols: ["https", "mailto"],
      defaultProtocol: "https",
      autolink: false,
      linkOnPaste: true,
      openOnClick: false,
      isAllowedUri: isAllowedHref,
    }),
  ];
}
