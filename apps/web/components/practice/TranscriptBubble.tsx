import type { TranscriptRole } from "@pitchperfect/shared";
import { StreamingText } from "@/components/motion/streaming-text";
import { cn } from "@/lib/cn";

interface TranscriptBubbleProps {
  /** Who the line is from. */
  from: TranscriptRole;
  /** Who spoke, read out before the text: "You" or the persona's name. */
  speaker: string;
  text: string;
  /** Show the line arriving letter by letter, as the public previews do. */
  streaming?: boolean;
  /** A reply that is still arriving: dots until the first words, then the text as it comes. */
  pending?: boolean;
  /** A guardrail redirect: drawn quieter, since it isn't part of the score. */
  flagged?: boolean;
  /** A short line under the bubble, e.g. that a reply never arrived. */
  note?: string | undefined;
  /** `div` where the bubble isn't inside a list (the live reply). */
  as?: "li" | "div";
}

/** One transcript line: the student on the right in blue, the partner on the left in white. */
export function TranscriptBubble({
  from,
  speaker,
  text,
  streaming = false,
  pending = false,
  flagged = false,
  note,
  as: Tag = "li",
}: TranscriptBubbleProps) {
  const student = from === "student";
  return (
    <Tag className={cn("flex flex-col gap-1", student ? "items-end" : "items-start")}>
      <p
        className={cn(
          "max-w-[85%] rounded-card px-4 py-2.5 text-small whitespace-pre-line",
          streaming && "min-w-[60%]",
          student
            ? "rounded-br-md bg-primary text-white"
            : "rounded-bl-md border border-border bg-surface text-ink",
          flagged && !student && "border-dashed border-muted bg-surface-2",
        )}
      >
        <span className="sr-only">{speaker} said: </span>
        {streaming ? <StreamingText text={text} /> : text}
        {pending && text === "" && (
          <span aria-hidden="true" className="pp-level inline-flex h-4 items-end gap-1">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="size-1.5 rounded-pill bg-muted"
                style={{ ["--i" as string]: index }}
              />
            ))}
          </span>
        )}
      </p>
      {note && <p className="px-1 text-caption text-muted">{note}</p>}
    </Tag>
  );
}
