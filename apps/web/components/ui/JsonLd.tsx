type JsonLdData = Record<string, unknown>;

interface JsonLdProps {
  data: JsonLdData | JsonLdData[];
}

/** Characters escaped so the JSON can never close the script element or open a comment. */
const UNSAFE = /[<>&\u2028\u2029]/g;
const escape = (char: string) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;

/** Structured data for search engines. A data block, so CSP doesn't treat it as script. */
export function JsonLd({ data }: JsonLdProps) {
  const json = JSON.stringify(data).replace(UNSAFE, escape);
  // JSON, not HTML: React would entity-encode a text child and break it.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
