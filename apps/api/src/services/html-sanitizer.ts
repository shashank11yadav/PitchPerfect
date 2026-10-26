import { parseFragment, serialize } from "parse5";
import sanitizeHtml from "sanitize-html";
import {
  JOB_HTML_LINK_ATTRIBUTES,
  JOB_HTML_LINK_REL,
  JOB_HTML_LINK_SCHEMES,
  JOB_HTML_SAFE_HREF,
  JOB_HTML_TAGS,
  stripInvisible,
} from "@pitchperfect/shared";

/** The shared allowlist from docs/security.md ("Stored XSS"). Everything else is dropped. */
const JOB_HTML: sanitizeHtml.IOptions = {
  allowedTags: [...JOB_HTML_TAGS],
  allowedAttributes: { a: [...JOB_HTML_LINK_ATTRIBUTES] },
  allowedSchemes: [...JOB_HTML_LINK_SCHEMES],
  allowProtocolRelative: false,
  transformTags: {
    // Runs before the attribute and scheme filters, so only `href` can survive from the input.
    // `allowedSchemes` ignores relative and schemeless URLs, so the check is repeated here.
    a: (tagName, attribs): sanitizeHtml.Tag => {
      const { href } = attribs;
      if (href === undefined || !JOB_HTML_SAFE_HREF.test(href.trim())) {
        // "span" is not an allowed tag, so the anchor goes and its text stays.
        return { tagName: "span", attribs: {} };
      }
      return { tagName, attribs: { href, rel: JOB_HTML_LINK_REL, target: "_blank" } };
    },
  },
};

const TEXT_ONLY: sanitizeHtml.IOptions = { allowedTags: [], allowedAttributes: {} };

/** Tags that end a line of text; replaced by a space so neighboring words don't run together. The attribute run is bounded to keep matching linear. */
const BLOCK_BOUNDARY = /<\/?(?:p|br|li|ul|ol|h[1-6]|blockquote|div)\b[^>]{0,200}>/gi;

/**
 * `html` as a browser reads it: parsed with the HTML standard's rules into a tree (parse5) and
 * written back out from that tree. Every tag in the result is closed and properly nested, so it
 * reads back as the same tree; mis-nested and unclosed tags are resolved the way a browser does.
 */
const asParsedTree = (html: string) => serialize(parseFragment(html));

/**
 * Sanitizes employer-written job description HTML. Safe to store and to render. The input is
 * first read as a browser would, so the allowlist sees the structure readers will see, and the
 * result is serialized from a parsed tree, so what is stored is well-formed. Invisible characters
 * go last, since entities such as `&#8203;` are decoded by then.
 */
export function sanitizeJobHtml(html: string): string {
  return stripInvisible(asParsedTree(sanitizeHtml(asParsedTree(html), JOB_HTML)));
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
