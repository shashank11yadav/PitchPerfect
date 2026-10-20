import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { VisuallyHidden } from "./VisuallyHidden";

interface SpinnerProps {
  /** Announced as a status message; without it the spinner is decorative. */
  label?: string;
  className?: string;
}

export function Spinner({ label, className }: SpinnerProps) {
  const icon = (
    <LoaderCircle
      aria-hidden="true"
      className={cn("size-4 shrink-0 animate-spin motion-reduce:animate-none", className)}
    />
  );
  if (label === undefined) return icon;
  return (
    <span role="status" className="inline-flex items-center gap-2">
      {icon}
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  );
}
