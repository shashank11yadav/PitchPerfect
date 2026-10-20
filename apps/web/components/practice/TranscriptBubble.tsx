import type { TranscriptRole } from "@pitchperfect/shared";
import { StreamingText } from "@/components/motion/streaming-text";
import { cn } from "@/lib/cn";

interface TranscriptBubbleProps {
  /** Who the line is from. */
  from: TranscriptRole;
  /** Who spoke, read out before the text: "You" or the persona's name. */
  speaker: string;
  text: string;
  /** Show the line arriving letter by letter, as a streamed reply does. */
  streaming?: boolean;
}

/** One transcript line, rendered as a list item: the student on the right, the partner on the left. */
export function TranscriptBubble({
  from,
  speaker,
  text,
  streaming = false,
}: TranscriptBubbleProps) {
  const student = from === "student";
  return (
    <li className={cn("flex", student ? "justify-end" : "justify-start")}>
      <p
        className={cn(
          "max-w-[85%] rounded-card px-4 py-2.5 text-small",
          streaming && "min-w-[60%]",
          student
            ? "rounded-br-md bg-primary text-white"
            : "rounded-bl-md border border-border bg-surface text-ink",
        )}
      >
        <span className="sr-only">{speaker} said: </span>
        {streaming ? <StreamingText text={text} /> : text}
      </p>
    </li>
  );
}
