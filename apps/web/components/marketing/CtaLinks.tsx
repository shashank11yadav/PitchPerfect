import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";

export interface CtaLink {
  href: string;
  label: string;
}

const START_PRACTICING: CtaLink = { href: "/signup/student", label: "Start practicing" };
const IM_HIRING: CtaLink = { href: "/employers", label: "I'm hiring" };

interface CtaLinksProps {
  primary?: CtaLink;
  secondary?: CtaLink;
}

/** A solid and an outlined link for navy or blue backgrounds. */
export function CtaLinks({ primary = START_PRACTICING, secondary = IM_HIRING }: CtaLinksProps) {
  return (
    <>
      <Link href={primary.href} className={buttonClasses({ variant: "inverse", size: "lg" })}>
        {primary.label}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
      <Link
        href={secondary.href}
        className={buttonClasses({ variant: "inverse-outline", size: "lg" })}
      >
        {secondary.label}
      </Link>
    </>
  );
}
