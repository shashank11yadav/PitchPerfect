"use client";

import { Skeleton } from "./Skeleton";

/** Placeholder lines while a view loads, with the words for screen readers. */
export function Loading({ label, lines = 3 }: { label: string; lines?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="sr-only">
        {label}
      </p>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={index === 0 ? "h-6 w-2/3" : "h-5 w-full"} />
      ))}
    </div>
  );
}

/** A failed load: say so plainly and offer the retry. */
export function LoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-ink">We couldn’t load {what}. It may be a connection problem.</p>
      <button
        type="button"
        onClick={onRetry}
        className="pp-link rounded-control font-semibold text-primary"
      >
        Try again
      </button>
    </div>
  );
}
