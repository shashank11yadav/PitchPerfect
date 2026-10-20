import type { InterviewView } from "@pitchperfect/shared";
import { ArrowUpRight, CalendarClock } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatInterviewTime } from "@/lib/local-time";

/** Only ever link an https meeting room; the api enforces it too. */
const isHttps = (value: string) => URL.canParse(value) && new URL(value).protocol === "https:";

interface InterviewSlotProps {
  interview: InterviewView;
  /** "Join the interview" for the student, "Meeting link" for the employer. */
  linkLabel: string;
  className?: string;
}

/** A booked interview: the time in the viewer's own zone, and the meeting link. */
export function InterviewSlot({ interview, linkLabel, className }: InterviewSlotProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-control bg-primary-soft px-4 py-3 text-ink",
        className,
      )}
    >
      <p className="flex items-start gap-2 font-semibold">
        <CalendarClock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <span>
          <span className="sr-only">Interview: </span>
          <time dateTime={interview.startsAt}>{formatInterviewTime(interview.startsAt)}</time>
        </span>
      </p>
      {isHttps(interview.meetingUrl) && (
        <a
          href={interview.meetingUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="pp-link inline-flex items-center gap-1 self-start rounded-control pl-7 font-semibold text-primary"
        >
          {linkLabel}
          <ArrowUpRight aria-hidden="true" className="size-4" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}
