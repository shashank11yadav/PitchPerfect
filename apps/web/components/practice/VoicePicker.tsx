"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/cn";

interface VoicePickerProps {
  voices: readonly SpeechSynthesisVoice[];
  voice: SpeechSynthesisVoice | null;
  onVoiceChange: (voiceURI: string) => void;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
}

/** Which of the browser's voices the partner speaks with, and whether it speaks at all. */
export function VoicePicker({
  voices,
  voice,
  onVoiceChange,
  muted,
  onMutedChange,
}: VoicePickerProps) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {voices.length > 1 && (
        <>
          <label htmlFor={id} className="text-small font-semibold text-ink">
            Partner’s voice
          </label>
          <select
            id={id}
            value={voice?.voiceURI ?? ""}
            onChange={(event) => {
              onVoiceChange(event.target.value);
            }}
            disabled={muted}
            className="h-9 max-w-48 rounded-control border border-muted bg-surface px-2 text-small text-ink disabled:opacity-60"
          >
            {voices.map((option) => (
              <option key={option.voiceURI} value={option.voiceURI}>
                {option.name}
              </option>
            ))}
          </select>
        </>
      )}
      <button
        type="button"
        aria-pressed={muted}
        onClick={() => {
          onMutedChange(!muted);
        }}
        className={cn(
          "pp-press inline-flex h-9 items-center gap-1.5 rounded-pill px-3 text-small font-semibold",
          muted ? "bg-surface-2 text-ink" : "text-primary hover:bg-primary-soft",
        )}
      >
        {muted ? (
          <VolumeX aria-hidden="true" className="size-4" />
        ) : (
          <Volume2 aria-hidden="true" className="size-4" />
        )}
        Mute partner
      </button>
    </div>
  );
}
