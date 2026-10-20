"use client";

import { Button } from "@/components/ui/Button";

/** A student page that crashed: keep the shell and offer the retry. */
export default function StudentError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <h2 className="text-h3">This page didn’t load</h2>
      <p className="max-w-prose text-ink">
        Something went wrong on our side. Try again, and if it keeps happening, come back in a few
        minutes.
      </p>
      <Button onClick={retry}>Try again</Button>
    </div>
  );
}
