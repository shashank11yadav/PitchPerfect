/**
 * Top-level domains reserved for examples and testing (RFC 2606, RFC 6761). Nobody can register a
 * name under them, so no real company has its website there.
 */
const RESERVED_TOP_LEVEL = new Set(["example", "test", "invalid", "localhost"]);

/** Second-level domains reserved the same way. */
const RESERVED_DOMAINS = new Set(["example.com", "example.net", "example.org"]);

/**
 * True when a company's website is on a reserved domain, as every seeded company's is. Such a
 * company is made up: it is shown as a sample, never as verified, its website is never linked, and
 * its jobs stay out of search engines. Takes a URL or a bare hostname.
 */
export function isSampleWebsite(website: string): boolean {
  const value = website.trim();
  const url = URL.canParse(value) ? new URL(value) : URL.parse(`https://${value}`);
  if (!url?.hostname) return false;
  const labels = url.hostname.toLowerCase().replace(/\.$/, "").split(".");
  return (
    RESERVED_TOP_LEVEL.has(labels.at(-1) ?? "") || RESERVED_DOMAINS.has(labels.slice(-2).join("."))
  );
}
