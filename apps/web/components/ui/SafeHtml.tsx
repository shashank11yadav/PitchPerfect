import { cn } from "@/lib/cn";
import { sanitizeJobHtml } from "@/lib/html-allowlist";

interface SafeHtmlProps {
  /** HTML that was sanitized by the api on write; it is sanitized again here. */
  html: string;
  className?: string;
}

/** The only place that renders HTML. Styles the allowlisted tags for reading. */
export function SafeHtml({ html, className }: SafeHtmlProps) {
  return (
    <div
      className={cn("pp-prose", className)}
      // The one sanctioned use: the input passes the shared allowlist sanitizer first.
      dangerouslySetInnerHTML={{ __html: sanitizeJobHtml(html) }}
    />
  );
}
