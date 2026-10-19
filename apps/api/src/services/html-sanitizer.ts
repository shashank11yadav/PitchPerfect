import sanitizeHtml from "sanitize-html";

const LINK_REL = "noopener noreferrer nofollow";

/** The allowlist from docs/security.md ("Stored XSS"). Everything else is dropped. */
const SAFE_HREF = /^(?:https:|mailto:)/i;

const JOB_HTML: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "em", "u", "ul", "ol", "li", "h3", "h4", "a", "blockquote"],
  allowedAttributes: { a: ["href", "rel", "target"] },
  allowedSchemes: ["https", "mailto"],
  allowProtocolRelative: false,
  transformTags: {
    // Runs before the attribute and scheme filters, so only `href` can survive from the input.
    // `allowedSchemes` ignores relative and schemeless URLs, so the check is repeated here.
    a: (tagName, attribs): sanitizeHtml.Tag => {
      const { href } = attribs;
      if (href === undefined || !SAFE_HREF.test(href.trim())) {
        // "span" is not an allowed tag, so the anchor goes and its text stays.
        return { tagName: "span", attribs: {} };
      }
      return { tagName, attribs: { href, rel: LINK_REL, target: "_blank" } };
    },
  },
};

const TEXT_ONLY: sanitizeHtml.IOptions = { allowedTags: [], allowedAttributes: {} };

/** Tags that end a line of text; replaced by a space so neighbouring words don't run together. The attribute run is bounded to keep matching linear. */
const BLOCK_BOUNDARY = /<\/?(?:p|br|li|ul|ol|h[1-6]|blockquote|div)\b[^>]{0,200}>/gi;

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
