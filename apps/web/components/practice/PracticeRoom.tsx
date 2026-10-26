"use client";

import { getSkill, type AttemptView, type SkillSlug } from "@pitchperfect/shared";
import { Clock, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import type { PracticePartnerKind } from "@pitchperfect/shared";
import { historyHref } from "@/lib/practice/paths";
import { canEnd, type RoomEntry, type RoomState } from "@/lib/practice/practice-reducer";
import { usePracticeQuota } from "@/lib/practice/use-practice-partner";
import { usePracticeRoom, type PracticeRoomControls } from "@/lib/practice/use-practice-room";
import { ComposeBar } from "./ComposeBar";
import { PersonaCard } from "./PersonaCard";
import { RoomLobby } from "./RoomLobby";
import { Scorecard } from "./Scorecard";
import { StageStepper } from "./StageStepper";
import { SUPPORT_LABEL, SupportNote } from "./SupportNote";
import { TranscriptBubble } from "./TranscriptBubble";

type PracticeRoomProps =
  | { skill: SkillSlug; jobId?: string | undefined; attempt?: never }
  | { attempt: AttemptView; skill?: never; jobId?: never };

/** "19:58" */
function clock(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Why a line is shown the way it is, under the bubble. */
function noteFor(entry: RoomEntry): string | undefined {
  if (entry.interrupted) return "No reply came back";
  if (entry.flagged && entry.role === "partner") return "Off the call, so not scored";
  return undefined;
}

/** What the live region reads out: the partner's newest line, or a support message by name. */
function announcementOf(state: RoomState, persona: string): string {
  const last = state.transcript.at(-1);
  if (last?.role === "support") return `${SUPPORT_LABEL}: ${last.text}`;
  return state.announcement && `${persona} said: ${state.announcement}`;
}

function Transcript({ state, persona }: { state: RoomState; persona: string }) {
  const end = useRef<HTMLDivElement>(null);
  const replying = state.status === "sending" || state.status === "streaming";

  // Keep the newest line in view as the conversation grows.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [state.transcript.length, state.streamingText, replying]);

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <ul aria-label="Transcript" className="flex flex-col gap-2.5">
        {state.transcript.map((entry, index) =>
          entry.role === "support" ? (
            <SupportNote key={index} text={entry.text} />
          ) : (
            <TranscriptBubble
              key={index}
              from={entry.role}
              speaker={entry.role === "student" ? "You" : persona}
              text={entry.text}
              flagged={entry.flagged === true}
              note={noteFor(entry)}
            />
          ),
        )}
      </ul>
      {/*
        A reply streams in here, outside the live region: a sentence on screen can still be taken
        back by a retract, so it is never read out. Finished replies join the list above.
      */}
      {replying && (
        <TranscriptBubble
          as="div"
          from="partner"
          speaker={persona}
          text={state.streamingText}
          pending
        />
      )}
      {/* Reads out each reply once, when it is final (`done`), and support messages by name. */}
      <div aria-live="polite" data-live="reply">
        <p className="sr-only">{announcementOf(state, persona)}</p>
      </div>
      {/* Room for the reply box and tab bar that stay over the bottom of the screen. */}
      <div ref={end} className="scroll-mb-44 md:scroll-mb-32" />
    </div>
  );
}

/** Instead of the compose bar once the session can't take turns. */
function EndedPanel({ room }: { room: PracticeRoomControls }) {
  const { state } = room;
  return (
    <div className="flex flex-col gap-4 border-t border-border bg-surface px-4 py-5 md:px-6">
      <p role="status" className="max-w-prose text-ink">
        {state.notice}
      </p>
      {state.error && (
        <p role="alert" className="text-small font-semibold text-danger">
          {state.error.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {canEnd(state) ? (
          <Button size="lg" onClick={() => void room.end()}>
            End and score
          </Button>
        ) : (
          <button type="button" onClick={room.reset} className={buttonClasses({ size: "lg" })}>
            Start a new session
          </button>
        )}
        <Link href={historyHref()} className="pp-link rounded-control font-semibold text-primary">
          Your past sessions
        </Link>
      </div>
    </div>
  );
}

function Scoring() {
  return (
    <div
      role="status"
      className="flex items-center gap-3 border-t border-border bg-surface px-4 py-5 text-ink md:px-6"
    >
      <Spinner />
      Scoring your call. This takes a few seconds.
    </div>
  );
}

interface SessionProps {
  room: PracticeRoomControls;
  skill: SkillSlug;
  partner: PracticePartnerKind;
}

function Session({ room, skill, partner }: SessionProps) {
  const { state, timeLeftMs } = room;
  const scenario = state.scenario;
  if (!scenario) return null;
  const turns = state.turnsLeft === 1 ? "1 turn left" : `${String(state.turnsLeft)} turns left`;
  const outOfTime = timeLeftMs === 0;

  return (
    <section
      aria-labelledby="room-title"
      className="overflow-clip rounded-card border border-border bg-surface shadow-card"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3 md:px-6">
        <div>
          <p className="text-caption text-muted">Practice call</p>
          <h2 id="room-title" className="text-h4">
            {getSkill(skill).title}
          </h2>
        </div>
        <div className="flex gap-4 text-small font-semibold text-ink">
          <span className="inline-flex items-center gap-1.5">
            <MessagesSquare aria-hidden="true" className="size-4 text-primary" />
            {turns}
          </span>
          {timeLeftMs !== null && (
            <span className={cn("inline-flex items-center gap-1.5", outOfTime && "text-danger")}>
              <Clock aria-hidden="true" className="size-4 text-primary" />
              {outOfTime ? "Time’s up" : `${clock(timeLeftMs)} left`}
            </span>
          )}
        </div>
      </header>
      <StageStepper stage={state.stage} className="border-b border-border px-4 py-3 md:px-6" />

      <div className="grid gap-4 bg-surface-2 p-4 md:p-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-6">
        <PersonaCard
          persona={scenario}
          partner={partner}
          titleAs="h3"
          className="self-start lg:sticky lg:top-24"
        />
        <Transcript state={state} persona={scenario.personaName} />
      </div>

      {state.status === "ending" ? (
        <Scoring />
      ) : state.status === "ended" ? (
        <EndedPanel room={room} />
      ) : (
        <ComposeBar room={room} />
      )}
    </section>
  );
}

/**
 * The practice room: the start screen, the call itself, and the scorecard once it's scored.
 * Given an `attempt`, it picks up that session where it was left.
 */
export function PracticeRoom(props: PracticeRoomProps) {
  const skill = props.attempt ? props.attempt.skill : props.skill;
  const jobId = props.attempt ? (props.attempt.jobId ?? undefined) : props.jobId;
  const room = usePracticeRoom({ skill, jobId, resume: props.attempt });
  // One quota load for the lobby's meter and for naming the partner truthfully in both views.
  const quota = usePracticeQuota();
  const { reload: reloadQuota } = quota;
  const { status, result } = room.state;

  // The scorecard replaces a long transcript: start it at the top, ring first. The call just used
  // a session, so the quota is asked again rather than kept from before the call.
  useEffect(() => {
    if (status !== "scored") return;
    window.scrollTo({ top: 0 });
    reloadQuota();
  }, [status, reloadQuota]);

  // Back to the lobby with a fresh meter: the quota may have moved since the lobby last loaded.
  const { reset: resetRoom } = room;
  const reset = useCallback(() => {
    resetRoom();
    reloadQuota();
  }, [resetRoom, reloadQuota]);
  const controls: PracticeRoomControls = { ...room, reset };

  switch (status) {
    case "idle":
    case "starting":
    case "error":
      return <RoomLobby skill={skill} jobId={jobId} room={controls} quota={quota} />;
    case "scored":
      return result ? <Scorecard attempt={result} onPracticeAgain={reset} /> : null;
    case "ready":
    case "listening":
    case "sending":
    case "streaming":
    case "ending":
    case "ended":
      return <Session room={controls} skill={skill} partner={quota.partner} />;
  }
}
