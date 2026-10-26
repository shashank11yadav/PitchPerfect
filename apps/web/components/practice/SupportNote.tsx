import { LifeBuoy } from "lucide-react";
import { useId } from "react";

/** How the support message is named on screen and to screen readers. */
export const SUPPORT_LABEL = "A message from PitchPerfect";

/**
 * The support message after a turn that signalled self-harm: PitchPerfect speaking, outside the
 * call, so it spans the transcript instead of sitting in the partner's bubble. The text is shown
 * as plain text, as it arrived.
 */
export function SupportNote({ text }: { text: string }) {
  const labelId = useId();
  return (
    <li>
      <div
        role="note"
        aria-labelledby={labelId}
        className="flex gap-3 rounded-card border border-primary/30 bg-primary-soft px-4 py-3 text-small text-ink"
      >
        <LifeBuoy aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="flex min-w-0 flex-col gap-1">
          <p id={labelId} className="font-semibold text-navy">
            {SUPPORT_LABEL}
          </p>
          <p className="whitespace-pre-line">{text}</p>
        </div>
      </div>
    </li>
  );
}
