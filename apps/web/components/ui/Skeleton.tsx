import { cn } from "@/lib/cn";

/** A loading placeholder. Hidden from assistive tech; pair it with a status message. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-control bg-border motion-reduce:animate-none",
        className,
      )}
    />
  );
}
