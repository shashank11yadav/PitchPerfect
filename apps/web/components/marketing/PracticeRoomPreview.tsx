import { STAGES } from "@pitchperfect/shared";
import { Clock, MessagesSquare, Mic, Send } from "lucide-react";
import { PersonaCard } from "@/components/practice/PersonaCard";
import { TranscriptBubble } from "@/components/practice/TranscriptBubble";
import { cn } from "@/lib/cn";
import { OBJECTION_MOMENT, turnsLeft, type RoomMoment } from "./sample-session";

export const STAGE_LABELS = {
  opening: "Opening",
  discovery: "Discovery",
  pitch: "Pitch",
  objection: "Objection",
  close: "Close",
} as const;

const LEVELS = ["h-2", "h-4", "h-6", "h-3", "h-5"];

interface PracticeRoomPreviewProps {
  /** Which call, and which point in it, the room shows. */
  moment?: RoomMoment;
  /** Lifted with a shadow, for when the window overlaps the edge between two sections. */
  floating?: boolean;
  className?: string;
}

/**
 * A static practice room built from the real components and the sample session. In a wide frame
 * the persona sits beside the transcript, as in the app on desktop. The partner's last reply
 * streams in the first time it scrolls into view.
 */
export function PracticeRoomPreview({
  moment = OBJECTION_MOMENT,
  floating = false,
  className,
}: PracticeRoomPreviewProps) {
  const { persona, skillTitle, stage, timeLeft, transcript, streamedReply } = moment;
  const current = STAGES.indexOf(stage);
  return (
    <figure
      data-ui
      className={cn(
        "@container overflow-hidden rounded-[20px] bg-surface text-ink",
        floating ? "shadow-float" : "ring-1 ring-border",
        className,
      )}
    >
      <figcaption className="sr-only">
        A sample practice session: a student practicing {skillTitle.toLowerCase()} with an AI
        practice partner.
      </figcaption>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 @2xl:px-6">
        <div>
          <p className="text-caption text-muted">Practice</p>
          <p className="text-small font-bold text-ink">{skillTitle}</p>
        </div>
        <div className="flex gap-3 text-caption font-semibold text-ink">
          <span className="inline-flex items-center gap-1">
            <MessagesSquare aria-hidden="true" className="size-3.5 text-primary" />
            {turnsLeft(moment)} turns left
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock aria-hidden="true" className="size-3.5 text-primary" />
            {timeLeft} left
          </span>
        </div>
      </div>

      <ol
        aria-label="Conversation stages"
        className="flex gap-1.5 border-b border-border px-4 py-3 @2xl:px-6"
      >
        {STAGES.map((stage, index) => (
          <li
            key={stage}
            aria-current={index === current ? "step" : undefined}
            className="flex min-w-0 flex-1 flex-col gap-1.5"
          >
            <span
              aria-hidden="true"
              className={cn("h-1 rounded-pill", index <= current ? "bg-primary" : "bg-border")}
            />
            <span
              className={cn(
                "truncate text-caption",
                index === current ? "font-bold text-primary" : "text-muted",
              )}
            >
              {STAGE_LABELS[stage]}
            </span>
          </li>
        ))}
      </ol>

      <div className="grid gap-4 bg-surface-2 p-4 @2xl:grid-cols-[15rem_1fr] @2xl:gap-6 @2xl:p-6">
        <PersonaCard persona={persona} titleAs="p" className="self-start" />
        <ul aria-label="Transcript" className="flex flex-col gap-2.5">
          {transcript.map((entry) => (
            <TranscriptBubble
              key={entry.text}
              from={entry.role}
              speaker={entry.role === "student" ? "You" : persona.personaName}
              text={entry.text}
            />
          ))}
          <TranscriptBubble
            from="partner"
            speaker={persona.personaName}
            text={streamedReply}
            streaming
          />
        </ul>
      </div>

      <div
        aria-hidden="true"
        className="flex items-center gap-3 border-t border-border px-4 py-3 @2xl:px-6"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-primary text-white">
          <Mic className="size-5" />
        </span>
        <span className="pp-level flex h-6 items-end gap-0.5">
          {LEVELS.map((height, index) => (
            <span
              key={index}
              className={cn("w-1 rounded-pill bg-primary/60", height)}
              style={{ ["--i" as string]: index }}
            />
          ))}
        </span>
        <span className="min-w-0 flex-1 truncate rounded-control border border-border px-3 py-2 text-small text-muted">
          Hold Space to talk, or type
        </span>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary">
          <Send className="size-4" />
        </span>
      </div>
    </figure>
  );
}
