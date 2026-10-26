import {
  JOB_HTML_LINK_ATTRIBUTES,
  JOB_HTML_LINK_REL,
  JOB_HTML_SAFE_HREF,
  JOB_HTML_TAGS,
} from "@pitchperfect/shared";
import DOMPurify from "isomorphic-dompurify";

/*
 * The job-description HTML allowlist from docs/security.md ("Stored XSS"), the same one the api's
 * sanitizer (apps/api/src/services/html-sanitizer.ts) uses, from @pitchperfect/shared.
 */
const ALLOWED_TAGS = [...JOB_HTML_TAGS];
const ALLOWED_ATTR = [...JOB_HTML_LINK_ATTRIBUTES];

// Registered once on the shared instance, which only this module uses.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.nodeName !== "A") return;
  const href = node.getAttribute("href");
  if (href === null || !JOB_HTML_SAFE_HREF.test(href.trim())) {
    // Like the api: the anchor goes and its text stays.
    node.replaceWith(...Array.from(node.childNodes));
    return;
  }
  node.setAttribute("rel", JOB_HTML_LINK_REL);
  node.setAttribute("target", "_blank");
});

/** Sanitizes job-description HTML with the shared allowlist. Safe to render. */
export function sanitizeJobHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: JOB_HTML_SAFE_HREF,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
}
