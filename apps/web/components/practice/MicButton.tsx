"use client";

import { Mic } from "lucide-react";
import type { KeyboardEvent } from "react";
import { PointerText } from "@/components/ui/PointerText";
import { cn } from "@/lib/cn";

const LEVELS = ["h-2", "h-4", "h-6", "h-3", "h-5"];

interface MicButtonProps {
  listening: boolean;
  disabled?: boolean;
  /** Called when the student reaches for the button, before they press it. */
  onPrepare?: () => void;
  onStart: () => void;
  onStop: () => void;
}

/**
 * Push to talk: hold the button (pointer or Space while it has focus) and let go to stop. It only
 * fills the draft; sending is always a separate step.
 */
export function MicButton({
  listening,
  disabled = false,
  onPrepare,
  onStart,
  onStop,
}: MicButtonProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " ") return;
    // Space would also "click" the button on release; holding it is the whole gesture here.
    event.preventDefault();
    if (!event.repeat && !listening) onStart();
  };
  const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " ") return;
    event.preventDefault();
    onStop();
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={listening}
        aria-describedby="mic-hint"
        onPointerEnter={onPrepare}
        onFocus={onPrepare}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          onStart();
        }}
        onPointerUp={onStop}
        onPointerCancel={onStop}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => {
          if (listening) onStop();
        }}
        // Long-pressing on a phone would otherwise open the context menu.
        onContextMenu={(event) => {
          event.preventDefault();
        }}
        className={cn(
          "pp-press flex size-16 shrink-0 touch-none items-center justify-center rounded-pill text-white select-none",
          "disabled:cursor-not-allowed disabled:opacity-60",
          listening ? "bg-navy ring-4 ring-primary/30" : "bg-primary hover:bg-primary-hover",
        )}
      >
        <Mic aria-hidden="true" className="size-7" />
        <span className="sr-only">Hold to talk</span>
      </button>
      <span
        aria-hidden="true"
        className={cn("flex h-6 items-end gap-0.5", listening ? "pp-level" : "opacity-40")}
      >
        {LEVELS.map((height, index) => (
          <span
            key={index}
            className={cn(
              "w-1 rounded-pill",
              listening ? cn("bg-primary", height) : "h-1.5 bg-muted",
            )}
            style={{ ["--i" as string]: index }}
          />
        ))}
      </span>
      <p id="mic-hint" className="sr-only">
        <PointerText
          fine="Hold Space or press and hold to talk."
          coarse="Press and hold to talk."
        />{" "}
        What you say goes into the reply box, and nothing is sent until you choose Send.
      </p>
    </div>
  );
}
