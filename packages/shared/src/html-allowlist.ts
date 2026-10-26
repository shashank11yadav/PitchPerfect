/**
 * The job-description HTML allowlist from docs/security.md ("Stored XSS"). The api sanitizes
 * with it on write (sanitize-html) and the web again before rendering (DOMPurify); the web's
 * editor schema has the same nodes and marks. Everything else is dropped.
 */

/** The only tags kept. */
export const JOB_HTML_TAGS = [
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
] as const;

/** The only attributes kept, all on links. `rel` and `target` are set, never taken from input. */
export const JOB_HTML_LINK_ATTRIBUTES = ["href", "rel", "target"] as const;

/** The link schemes kept: absolute https and mailto. */
export const JOB_HTML_LINK_SCHEMES = ["https", "mailto"] as const;

/** The same schemes as a test on a trimmed `href`; relative and schemeless links fail it. */
export const JOB_HTML_SAFE_HREF = /^(?:https:|mailto:)/i;

/** Every kept link opens in a new tab with this `rel`. */
export const JOB_HTML_LINK_REL = "noopener noreferrer nofollow";
