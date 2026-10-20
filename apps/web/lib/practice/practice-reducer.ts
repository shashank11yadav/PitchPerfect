import {
  LIMITS,
  type AttemptView,
  type EndedReason,
  type ScenarioPublic,
  type Scorecard,
  type Stage,
  type TranscriptEntry,
} from "@pitchperfect/shared";

/**
 * The practice room as a pure state machine. Side effects (the api, speech) live in
 * `use-practice-room.ts`, which dispatches what happened. Nothing here ever sends a turn on its
 * own: speech only fills the draft, and only `send` (a click or Enter) starts a turn.
 */

type RoomStatus =
  | "idle"
  | "starting"
  | "ready"
  | "listening"
  | "sending"
  | "streaming"
  | "ending"
  | "scored"
  | "ended"
  | "error";

export type RoomMode = "voice" | "text";

/** The browser recognition errors the room tells apart; anything else is mapped onto these. */
export type SpeechErrorCode =
  "not-allowed" | "service-not-allowed" | "network" | "no-speech" | "aborted";

/** Why the room stopped taking turns: the api's reasons, or a session too short to score. */
export type RoomEndReason = EndedReason | "abandoned";

/** A transcript line as the room shows it. */
export interface RoomEntry extends Pick<TranscriptEntry, "role" | "text"> {
  /** A guardrail redirect and the student line that caused it; neither is scored. */
  flagged?: boolean;
  /** A student line whose reply never arrived; the next send replaces it. */
  interrupted?: boolean;
}

export interface RoomState {
  status: RoomStatus;
  mode: RoomMode;
  draft: string;
  transcript: RoomEntry[];
  /** The partner's reply as it streams in; replaced by the checked final text on `done`. */
  streamingText: string;
  stage: Stage;
  turnsLeft: number;
  /** When the session stops taking turns (20 minutes after it started). */
  expiresAt?: string;
  notice?: string;
  scorecard?: Scorecard;
  error?: { code: string; message: string };
  attemptId?: string;
  scenario?: ScenarioPublic;
  endedReason?: RoomEndReason;
  /** The ended attempt the api returned, once scored. */
  result?: AttemptView;
  /** Read out by the live region when a reply arrives without streamed text. */
  announcement: string;
  /** What the draft held when listening started; speech is added after it. */
  speechBase: string;
}

export type RoomAction =
  | { type: "start_requested" }
  | {
      type: "started";
      attemptId: string;
      scenario: ScenarioPublic;
      expiresAt: string;
      /** A resumed session's lines so far, after the opening line. */
      transcript?: RoomEntry[];
      stage?: Stage;
      turnsLeft?: number;
    }
  | { type: "start_failed"; code: string; message: string }
  | { type: "listen_start" }
  | { type: "interim"; text: string }
  | { type: "final"; text: string }
  | { type: "speech_error"; code: SpeechErrorCode }
  | { type: "send" }
  | { type: "delta"; text: string }
  | { type: "done"; stage: Stage; turnsLeft: number; finalText: string }
  | { type: "redirect"; text: string }
  | { type: "ended"; reason: EndedReason }
  | { type: "stream_error"; code: string; message?: string }
  | { type: "end_requested" }
  | { type: "end_failed"; code: string; message: string }
  | { type: "scored"; attempt: AttemptView }
  | { type: "set_mode"; mode: RoomMode }
  | { type: "edit_draft"; text: string };

const INTERRUPTED_MESSAGE = "Reply interrupted — try again";
const BUSY_MESSAGE = "Still working on the last reply";

const SPEECH_NOTICES: Record<SpeechErrorCode, string | undefined> = {
  "not-allowed":
    "The microphone is blocked, so you’re typing for now. Allow it in your browser’s site settings to talk again.",
  "service-not-allowed": "This browser can’t turn speech into text here, so you’re typing for now.",
  network:
    "Speech recognition lost its connection, so you’re typing for now. What it caught is in the box.",
  "no-speech": "We didn’t hear anything. Hold the mic button while you talk, or type instead.",
  aborted: undefined,
};

/** These mean voice won't work right now; the room falls back to typing. */
const SWITCHES_TO_TEXT: ReadonlySet<SpeechErrorCode> = new Set([
  "not-allowed",
  "service-not-allowed",
  "network",
]);

export const END_NOTICES: Record<RoomEndReason, string> = {
  turn_limit: "That was your last turn. End the session to get your scorecard.",
  expired: "The 20 minutes are up. End the session to get your scorecard.",
  guard_limit:
    "This session ended because several messages were off the call. Your other sessions aren’t affected. Start a new session when you’re ready.",
  abandoned:
    "This session wasn’t scored. A scorecard needs at least two of your replies, so start a new session and keep going a little longer.",
};

export function initialRoomState(mode: RoomMode = "voice"): RoomState {
  return {
    status: "idle",
    mode,
    draft: "",
    transcript: [],
    streamingText: "",
    stage: "opening",
    turnsLeft: LIMITS.maxStudentTurns,
    announcement: "",
    speechBase: "",
  };
}

/** Speech added after typed text, with one space between. */
const joinText = (base: string, spoken: string) =>
  [base.trimEnd(), spoken.trim()].filter(Boolean).join(" ");

const inTurn = (state: RoomState) => state.status === "sending" || state.status === "streaming";

/** Whether `send` would start a turn: the room is free and the draft fits the limits. */
export function canSend(state: RoomState): boolean {
  const length = state.draft.trim().length;
  return (
    (state.status === "ready" || state.status === "listening") &&
    length >= LIMITS.turnMinChars &&
    length <= LIMITS.turnMaxChars
  );
}

/** Whether the session can be ended and scored now. */
export function canEnd(state: RoomState): boolean {
  if (state.status === "ready" || state.status === "listening") return true;
  return (
    state.status === "ended" &&
    (state.endedReason === "turn_limit" || state.endedReason === "expired")
  );
}

const lastEntry = (state: RoomState) => state.transcript.at(-1);

/** The transcript with its last entry changed. */
function withLast(transcript: RoomEntry[], change: (entry: RoomEntry) => RoomEntry): RoomEntry[] {
  const last = transcript.at(-1);
  return last ? [...transcript.slice(0, -1), change(last)] : transcript;
}

function send(state: RoomState): RoomState {
  if (!canSend(state)) return state;
  const text = state.draft.trim();
  const retrying = lastEntry(state)?.interrupted === true;
  const entry: RoomEntry = { role: "student", text };
  return {
    ...state,
    status: "sending",
    draft: "",
    speechBase: "",
    streamingText: "",
    announcement: "",
    error: undefined,
    transcript: retrying ? withLast(state.transcript, () => entry) : [...state.transcript, entry],
  };
}

function streamError(state: RoomState, code: string, message?: string): RoomState {
  if (!inTurn(state)) return state;
  const last = lastEntry(state);
  const unanswered = last?.role === "student" ? last : undefined;
  return {
    ...state,
    status: "ready",
    streamingText: "",
    error: {
      code,
      message: message ?? (code === "conflict" ? BUSY_MESSAGE : INTERRUPTED_MESSAGE),
    },
    draft: state.draft || (unanswered?.text ?? ""),
    transcript: unanswered
      ? withLast(state.transcript, (entry) => ({ ...entry, interrupted: true }))
      : state.transcript,
  };
}

function ended(state: RoomState, reason: EndedReason): RoomState {
  if (state.status === "scored" || state.status === "ending") return state;
  const next: RoomState = {
    ...state,
    status: "ended",
    endedReason: reason,
    streamingText: "",
    notice: END_NOTICES[reason],
  };
  // The turn never reached the partner: give the line back instead of showing it as said.
  if (state.status === "sending" && lastEntry(state)?.role === "student") {
    return {
      ...next,
      transcript: state.transcript.slice(0, -1),
      draft: state.draft || (lastEntry(state)?.text ?? ""),
    };
  }
  return next;
}

function speechError(state: RoomState, code: SpeechErrorCode): RoomState {
  const switches = SWITCHES_TO_TEXT.has(code);
  return {
    ...state,
    status: state.status === "listening" ? "ready" : state.status,
    mode: switches ? "text" : state.mode,
    notice: SPEECH_NOTICES[code] ?? state.notice,
  };
}

function scored(state: RoomState, attempt: AttemptView): RoomState {
  if (attempt.scorecard) {
    return { ...state, status: "scored", scorecard: attempt.scorecard, result: attempt };
  }
  return {
    ...state,
    status: "ended",
    endedReason: "abandoned",
    notice: END_NOTICES.abandoned,
    result: attempt,
  };
}

export function practiceReducer(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case "start_requested":
      if (state.status !== "idle" && state.status !== "error") return state;
      return { ...state, status: "starting", error: undefined };
    case "started":
      return {
        ...state,
        status: "ready",
        error: undefined,
        attemptId: action.attemptId,
        scenario: action.scenario,
        expiresAt: action.expiresAt,
        stage: action.stage ?? "opening",
        turnsLeft: action.turnsLeft ?? LIMITS.maxStudentTurns,
        transcript: [
          { role: "partner", text: action.scenario.openingLine },
          ...(action.transcript ?? []),
        ],
        announcement: action.transcript?.length ? "" : action.scenario.openingLine,
      };
    case "start_failed":
      return { ...state, status: "error", error: { code: action.code, message: action.message } };
    case "listen_start":
      if (state.status !== "ready") return state;
      return {
        ...state,
        status: "listening",
        mode: "voice",
        notice: undefined,
        speechBase: state.draft,
      };
    case "interim":
    case "final":
      if (state.status !== "listening") return state;
      return {
        ...state,
        status: action.type === "final" ? "ready" : "listening",
        draft: joinText(state.speechBase, action.text),
      };
    case "speech_error":
      return speechError(state, action.code);
    case "send":
      return send(state);
    case "delta":
      if (!inTurn(state)) return state;
      return { ...state, status: "streaming", streamingText: state.streamingText + action.text };
    case "done":
      if (!inTurn(state)) return state;
      return {
        ...state,
        status: "ready",
        stage: action.stage,
        turnsLeft: action.turnsLeft,
        streamingText: "",
        announcement: state.streamingText ? "" : action.finalText,
        transcript: [...state.transcript, { role: "partner", text: action.finalText }],
      };
    case "redirect":
      if (!inTurn(state)) return state;
      return {
        ...state,
        status: "ready",
        turnsLeft: Math.max(0, state.turnsLeft - 1),
        streamingText: "",
        announcement: action.text,
        transcript: [
          ...withLast(state.transcript, (entry) =>
            entry.role === "student" ? { ...entry, flagged: true } : entry,
          ),
          { role: "partner", text: action.text, flagged: true },
        ],
      };
    case "ended":
      return ended(state, action.reason);
    case "stream_error":
      return streamError(state, action.code, action.message);
    case "end_requested":
      if (!canEnd(state)) return state;
      return { ...state, status: "ending", error: undefined };
    case "end_failed":
      if (state.status !== "ending") return state;
      return {
        ...state,
        status: state.endedReason ? "ended" : "ready",
        error: { code: action.code, message: action.message },
      };
    case "scored":
      return scored(state, action.attempt);
    case "set_mode":
      return {
        ...state,
        mode: action.mode,
        // A speech notice is about the old mode; why the session ended still applies.
        notice: state.endedReason ? state.notice : undefined,
        status: state.status === "listening" ? "ready" : state.status,
      };
    case "edit_draft":
      return { ...state, draft: action.text };
  }
}
