"use client";

import { LIMITS, type AttemptView, type PracticeEvent, type SkillSlug } from "@pitchperfect/shared";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { apiFetch, apiStream } from "@/lib/api";
import { OneAttempt, StartedPractice } from "@/lib/student-api";
import { attemptPath } from "./paths";
import { endProblem, startProblem, turnProblem } from "./practice-messages";
import {
  canEnd,
  canSend,
  initialRoomState,
  practiceReducer,
  type RoomAction,
  type RoomEntry,
  type RoomMode,
  type RoomState,
} from "./practice-reducer";
import { speechRecognitionSupported, useSpeechRecognition } from "./use-speech-recognition";
import { useSpeechSynthesis } from "./use-speech-synthesis";

const SESSION_MS = LIMITS.sessionSeconds * 1000;
const TICK_MS = 1000;

/** A session already under way, as the api stored it: picked up where it was left. */
function resumedState(attempt: AttemptView, mode: RoomMode): RoomState {
  const transcript: RoomEntry[] = attempt.transcript.map(({ role, text, flagged }) =>
    flagged ? { role, text, flagged: true } : { role, text },
  );
  const studentTurns = transcript.filter((entry) => entry.role === "student").length;
  const expiresAt = new Date(Date.parse(attempt.startedAt) + SESSION_MS).toISOString();
  const actions: RoomAction[] = [
    { type: "start_requested" },
    {
      type: "started",
      attemptId: attempt.id,
      scenario: attempt.scenarioPublic,
      expiresAt,
      transcript,
      stage: attempt.stage,
      turnsLeft: Math.max(0, LIMITS.maxStudentTurns - studentTurns),
    },
  ];
  if (studentTurns >= LIMITS.maxStudentTurns) actions.push({ type: "ended", reason: "turn_limit" });
  else if (Date.now() >= Date.parse(expiresAt)) actions.push({ type: "ended", reason: "expired" });
  return actions.reduce(practiceReducer, initialRoomState(mode));
}

interface Options {
  skill: SkillSlug;
  jobId?: string | undefined;
  /** An `active` attempt to pick up instead of starting a new one. */
  resume?: AttemptView | undefined;
}

/**
 * Everything the practice room does: start or resume a session, send turns and read the streamed
 * reply, listen and speak, count down, and end with a score. The UI reads `state` and calls the
 * actions; the reducer decides what each event means.
 */
export function usePracticeRoom({ skill, jobId, resume }: Options) {
  const [state, dispatch] = useReducer(practiceReducer, undefined, () => {
    const mode: RoomMode = speechRecognitionSupported() ? "voice" : "text";
    return resume ? resumedState(resume, mode) : initialRoomState(mode);
  });
  const latest = useRef(state);
  /** Set synchronously, so a double click can't start two turns or two ends before a render. */
  const busy = useRef<"turn" | "end" | "start" | null>(null);
  const turn = useRef<AbortController | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    latest.current = state;
  });

  const voice = useSpeechSynthesis();
  const { speak, cancel } = voice;
  const speakReply = useCallback(
    (text: string) => {
      if (latest.current.mode === "voice") speak(text);
    },
    [speak],
  );

  const recognition = useSpeechRecognition({
    lang: "en-US",
    onResult: (text, final) => {
      dispatch({ type: final ? "final" : "interim", text });
    },
    onError: (code) => {
      dispatch({ type: "speech_error", code });
    },
  });
  const { start: startListening, stop: stopListening } = recognition;

  // The countdown runs while the session is live; it ends the session between turns, never
  // in the middle of one (a turn the api accepted in time is still answered).
  const { expiresAt, status } = state;
  const live =
    expiresAt !== undefined &&
    (status === "ready" ||
      status === "listening" ||
      status === "sending" ||
      status === "streaming");
  useEffect(() => {
    if (!live) return;
    const deadline = Date.parse(expiresAt);
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      const between = latest.current.status === "ready" || latest.current.status === "listening";
      if (current >= deadline && between) {
        stopListening();
        dispatch({ type: "ended", reason: "expired" });
      }
    }, TICK_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [live, expiresAt, stopListening]);

  useEffect(
    () => () => {
      turn.current?.abort();
      cancel();
    },
    [cancel],
  );

  /** Starts a session; resolves to the failure's code, or null once the room is ready. */
  const start = useCallback(async (): Promise<string | null> => {
    if (busy.current !== null) return null;
    busy.current = "start";
    dispatch({ type: "start_requested" });
    try {
      const started = await apiFetch("/practice/sessions", {
        method: "POST",
        body: { skill, ...(jobId ? { jobId } : {}) },
        schema: StartedPractice,
      });
      dispatch({
        type: "started",
        attemptId: started.attemptId,
        scenario: started.scenario,
        expiresAt: started.limits.expiresAt,
      });
      setNow(Date.now());
      // A reload now comes back to this session instead of the start screen.
      window.history.replaceState(null, "", attemptPath(started.attemptId));
      speakReply(started.scenario.openingLine);
      return null;
    } catch (error) {
      const problem = startProblem(error);
      dispatch({ type: "start_failed", ...problem });
      return problem.code;
    } finally {
      busy.current = null;
    }
  }, [skill, jobId, speakReply]);

  const onEvent = useCallback(
    (event: PracticeEvent) => {
      switch (event.type) {
        case "delta":
          dispatch({ type: "delta", text: event.text });
          return;
        case "done":
          dispatch(event);
          speakReply(event.finalText);
          return;
        case "redirect":
          dispatch(event);
          speakReply(event.text);
          return;
        case "ended":
          dispatch(event);
          return;
        case "error":
          dispatch({ type: "stream_error", code: event.code });
          return;
      }
    },
    [speakReply],
  );

  const send = useCallback(() => {
    const current = latest.current;
    if (busy.current !== null || !canSend(current) || !current.attemptId) return;
    busy.current = "turn";
    stopListening();
    cancel();
    const text = current.draft.trim();
    dispatch({ type: "send" });

    const controller = new AbortController();
    turn.current = controller;
    let settled = false;
    const handle = (event: PracticeEvent) => {
      if (event.type !== "delta") settled = true;
      onEvent(event);
    };
    apiStream(`/practice/sessions/${current.attemptId}/turns`, { text }, handle, controller.signal)
      .then(
        () => {
          // The stream closed without saying how the turn ended.
          if (!settled) dispatch({ type: "stream_error", code: "upstream_error" });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          dispatch({ type: "stream_error", ...turnProblem(error) });
        },
      )
      .finally(() => {
        if (turn.current === controller) turn.current = null;
        busy.current = null;
      });
  }, [cancel, onEvent, stopListening]);

  const end = useCallback(async () => {
    const current = latest.current;
    if (busy.current !== null || !canEnd(current) || !current.attemptId) return;
    busy.current = "end";
    stopListening();
    cancel();
    dispatch({ type: "end_requested" });
    try {
      const attempt = await apiFetch(`/practice/sessions/${current.attemptId}/end`, {
        method: "POST",
        schema: OneAttempt,
      });
      dispatch({ type: "scored", attempt });
    } catch (error) {
      dispatch({ type: "end_failed", ...endProblem(error) });
    } finally {
      busy.current = null;
    }
  }, [cancel, stopListening]);

  const listen = useCallback(() => {
    if (latest.current.status !== "ready") return;
    cancel();
    dispatch({ type: "listen_start" });
    startListening();
  }, [cancel, startListening]);

  const setMode = useCallback(
    (mode: RoomMode) => {
      if (mode === "text") stopListening();
      dispatch({ type: "set_mode", mode });
    },
    [stopListening],
  );

  const editDraft = useCallback((text: string) => {
    dispatch({ type: "edit_draft", text });
  }, []);

  const timeLeftMs = expiresAt === undefined ? null : Math.max(0, Date.parse(expiresAt) - now);

  return {
    state,
    timeLeftMs,
    voice,
    recognition,
    start,
    send,
    end,
    listen,
    stopListening,
    setMode,
    editDraft,
  };
}

export type PracticeRoomControls = ReturnType<typeof usePracticeRoom>;
