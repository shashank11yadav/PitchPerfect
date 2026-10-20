import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { StatusMessage } from "@/components/layout/StatusMessage";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <StatusMessage
      title="We couldn't find that page"
      description="The link may be old, or the page may have moved."
    >
      <Link href="/" className={buttonClasses()}>
        Go to the home page
      </Link>
    </StatusMessage>
  );
}
