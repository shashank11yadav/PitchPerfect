"use client";

import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui/Button";
import { StatusMessage } from "@/components/layout/StatusMessage";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <StatusMessage
      title="Something went wrong"
      description="This page didn't load. Try again, and if it keeps happening, come back in a few minutes."
    >
      <Button onClick={retry}>Try again</Button>
      <Link href="/" className={buttonClasses({ variant: "secondary" })}>
        Go to the home page
      </Link>
    </StatusMessage>
  );
}
