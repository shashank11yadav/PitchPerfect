import Image from "next/image";
import { withBasePath } from "@/lib/pages-export";
import { SITE_NAME } from "@/lib/site";

interface LogoProps {
  /** White wordmark for navy backgrounds. */
  inverted?: boolean;
  className?: string;
}

/**
 * The wordmark at 32 px high (the source art is 332 × 64). The static export serves images as
 * they are, so the base path is added here; `next/image` adds it only when it optimizes.
 */
export function Logo({ inverted = false, className }: LogoProps) {
  return (
    <Image
      src={withBasePath(inverted ? "/brand/logo-white.svg" : "/brand/logo.svg")}
      alt={SITE_NAME}
      width={166}
      height={32}
      className={className}
      loading={inverted ? "lazy" : "eager"}
    />
  );
}
