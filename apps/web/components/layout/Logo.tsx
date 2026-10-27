import { withBasePath } from "@/lib/pages-export";
import { SITE_NAME } from "@/lib/site";

interface LogoProps {
  /** White wordmark for navy backgrounds. */
  inverted?: boolean;
  className?: string;
}

/**
 * The wordmark at 32 px high (the source art is 332 × 64). A plain `<img>`: `next/image` never
 * resizes an SVG, and its client code would load on every page (the navbar and footer show the
 * logo) for no gain. The static export serves files under its base path, added here.
 */
export function Logo({ inverted = false, className }: LogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- an SVG needs no optimizing
    <img
      src={withBasePath(inverted ? "/brand/logo-white.svg" : "/brand/logo.svg")}
      alt={SITE_NAME}
      width={166}
      height={32}
      className={className}
      loading={inverted ? "lazy" : "eager"}
      decoding="async"
    />
  );
}
