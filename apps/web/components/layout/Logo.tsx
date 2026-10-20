import Image from "next/image";
import { SITE_NAME } from "@/lib/site";

interface LogoProps {
  /** White wordmark for navy backgrounds. */
  inverted?: boolean;
  className?: string;
}

/** The wordmark at 32 px high (the source art is 332 × 64). */
export function Logo({ inverted = false, className }: LogoProps) {
  return (
    <Image
      src={inverted ? "/brand/logo-white.svg" : "/brand/logo.svg"}
      alt={SITE_NAME}
      width={166}
      height={32}
      className={className}
      loading={inverted ? "lazy" : "eager"}
    />
  );
}
