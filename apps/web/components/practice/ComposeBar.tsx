"use client";

import { LIMITS } from "@pitchperfect/shared";
import { Keyboard, Mic, Send } from "lucide-react";
import Link from "next/link";
import { useId, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/cn";
import { canEnd, canSend } from "@/lib/practice/practice-reducer";
import type { PracticeRoomControls } from "@/lib/practice/use-practice-room";
import { MicButton } from "./MicButton";
import { VoicePicker } from "./VoicePicker";

const MAX = LIMITS.turnMaxChars;
const count = new Intl.NumberFormat("en-US");

export const VOICE_DISCLOSURE =
  "Your browser may send audio to Google, Apple, or Microsoft to transcribe it. PitchPerfect never stores audio.";

/** The bottom of the room: talk or type, send, the partner's voice, and End session. */
export function ComposeBar({ room }: { room: PracticeRoomControls }) {
  const { state, recognition, voice } = room;
  const [confirming, setConfirming] = useState(false);
  const boxId = useId();
  const counterId = useId();
  const length = state.draft.trim().length;
  const tooLong = length > MAX;
  const voiceMode = state.mode === "voice" && recognition.supported;
  const listening = state.status === "listening";

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    room.send();
  };

  return (
    <>
      {/* Only the reply box stays on screen while the transcript scrolls; the rest sits below. */}
      <div className="sticky bottom-14 z-20 flex flex-col gap-2 border-t border-border bg-surface px-4 pt-3 pb-3 md:bottom-0 md:px-6 md:pt-4">
        {state.error && (
          <p role="alert" className="text-small font-semibold text-danger">
            {state.error.message}
          </p>
        )}
        <div className="flex items-end gap-3">
          {voiceMode && (
            <MicButton
              listening={listening}
              disabled={state.status !== "ready" && !listening}
              onPrepare={recognition.prepare}
              onStart={room.listen}
              onStop={room.stopListening}
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={boxId} className="text-small font-semibold text-ink">
                Your turn
              </label>
              <span
                id={counterId}
                className={cn("text-caption tabular-nums", tooLong ? "text-danger" : "text-muted")}
              >
                {tooLong
                  ? `${count.format(length - MAX)} characters over the limit`
                  : `${count.format(length)} / ${count.format(MAX)}`}
              </span>
            </div>
            <textarea
              id={boxId}
              rows={2}
              value={state.draft}
              aria-describedby={counterId}
              aria-invalid={tooLong || undefined}
              placeholder={
                voiceMode ? "Hold the mic and talk, or type here" : "Type what you’d say out loud"
              }
              onChange={(event) => {
                room.editDraft(event.target.value);
              }}
              onKeyDown={onKeyDown}
              className="max-h-48 min-h-14 w-full resize-y rounded-control border border-muted bg-surface px-3.5 py-2.5 text-body text-ink placeholder:text-muted aria-invalid:border-danger"
            />
          </div>
          <Button
            size="lg"
            disabled={!canSend(state)}
            aria-busy={state.status === "sending" || state.status === "streaming" || undefined}
            onClick={room.send}
            className="px-4 sm:px-6"
          >
            <Send aria-hidden="true" className="size-4" />
            <span className="max-sm:sr-only">Send</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 bg-surface px-4 pb-4 md:px-6">
        <p role="status" className="text-small text-ink empty:hidden">
          {state.notice}
        </p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {recognition.supported && (
            <button
              type="button"
              onClick={() => {
                room.setMode(voiceMode ? "text" : "voice");
              }}
              className="pp-press inline-flex h-9 items-center gap-1.5 rounded-pill px-3 text-small font-semibold text-primary hover:bg-primary-soft"
            >
              {voiceMode ? (
                <Keyboard aria-hidden="true" className="size-4" />
              ) : (
                <Mic aria-hidden="true" className="size-4" />
              )}
              {voiceMode ? "Type instead" : "Talk instead"}
            </button>
          )}
          {voice.supported && (
            <VoicePicker
              voices={voice.voices}
              voice={voice.voice}
              onVoiceChange={voice.setVoice}
              muted={voice.muted}
              onMutedChange={voice.setMuted}
            />
          )}
          <Button
            variant="secondary"
            size="sm"
            disabled={!canEnd(state)}
            onClick={() => {
              setConfirming(true);
            }}
            className="ml-auto"
          >
            End session
          </Button>
        </div>

        <p className="text-caption text-muted">
          {recognition.supported ? (
            <>
              {VOICE_DISCLOSURE}
              {recognition.onDevice &&
                " This browser can transcribe on your device, so it does."}{" "}
            </>
          ) : (
            "This browser can’t turn speech into text, so this call is typed. Chrome, Edge and Safari can listen. "
          )}
          <Link href="/privacy" className="pp-link rounded-control font-semibold text-primary">
            Privacy
          </Link>
        </p>

        <ConfirmDialog
          open={confirming}
          onClose={() => {
            setConfirming(false);
          }}
          title="End this session?"
          description="Your partner scores the call from the transcript. You can’t add turns after this."
          confirmLabel="End and score"
          cancelLabel="Keep talking"
          onConfirm={() => {
            void room.end();
            return Promise.resolve();
          }}
        />
      </div>
    </>
  );
}
