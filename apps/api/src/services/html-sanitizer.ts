import sanitizeHtml from "sanitize-html";

const LINK_REL = "noopener noreferrer nofollow";

/** The allowlist from docs/security.md ("Stored XSS"). Everything else is dropped. */
const JOB_HTML: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "em", "u", "ul", "ol", "li", "h3", "h4", "a", "blockquote"],
  allowedAttributes: { a: ["href", "rel", "target"] },
  allowedSchemes: ["https", "mailto"],
  allowProtocolRelative: false,
  transformTags: {
    // Runs before the attribute and scheme filters, so only `href` can survive from the input.
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...(attribs.href === undefined ? {} : { href: attribs.href }),
        rel: LINK_REL,
        target: "_blank",
      },
    }),
  },
};

const TEXT_ONLY: sanitizeHtml.IOptions = { allowedTags: [], allowedAttributes: {} };

/** Tags that end a line of text; replaced by a space so neighbouring words don't run together. */
const BLOCK_BOUNDARY = /<\/?(?:p|br|li|ul|ol|h[1-6]|blockquote|div)\b[^>]*>/gi;

/** Sanitizes employer-written job description HTML. Safe to store and to render. */
export function sanitizeJobHtml(html: string): string {
  return sanitizeHtml(html, JOB_HTML);
}

/** Plain text of some HTML: tags removed, entities decoded, whitespace collapsed. */
export function htmlToPlainText(html: string): string {
  const stripped = sanitizeHtml(html.replace(BLOCK_BOUNDARY, " "), TEXT_ONLY);
  // sanitize-html escapes exactly these four; `&amp;` goes last so `&amp;lt;` decodes only once.
  return stripped
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
