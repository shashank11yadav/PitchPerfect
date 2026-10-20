import DOMPurify from "isomorphic-dompurify";

/*
 * The job-description HTML allowlist from docs/security.md ("Stored XSS"). It mirrors the api's
 * sanitizer (apps/api/src/services/html-sanitizer.ts); change both together.
 */
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "ul",
  "ol",
  "li",
  "h3",
  "h4",
  "a",
  "blockquote",
];
const ALLOWED_ATTR = ["href", "rel", "target"];
/** Only absolute https and mailto links survive. */
const SAFE_HREF = /^(?:https:|mailto:)/i;
const LINK_REL = "noopener noreferrer nofollow";

// Registered once on the shared instance, which only this module uses.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.nodeName !== "A") return;
  const href = node.getAttribute("href");
  if (href === null || !SAFE_HREF.test(href.trim())) {
    // Like the api: the anchor goes and its text stays.
    node.replaceWith(...Array.from(node.childNodes));
    return;
  }
  node.setAttribute("rel", LINK_REL);
  node.setAttribute("target", "_blank");
});

/** Sanitizes job-description HTML with the shared allowlist. Safe to render. */
export function sanitizeJobHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: SAFE_HREF,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
}
