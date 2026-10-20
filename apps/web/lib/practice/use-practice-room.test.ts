import type { PracticeEvent } from "@pitchperfect/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completedAttempt } from "@/components/practice/test-fixtures";
import { ApiError, apiStream } from "@/lib/api";
import { jsonResponse, serveApi } from "@/lib/test-api";
import { usePracticeRoom } from "./use-practice-room";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiStream: vi.fn(),
}));

const stream = vi.mocked(apiStream);
const ID = "65f1c0ffee00000000000b01";

const active = () => ({
  ...completedAttempt(),
  status: "active" as const,
  stage: "opening" as const,
  transcript: [],
  scorecard: null,
  startedAt: new Date().toISOString(),
  endedAt: null,
});

/** A turn that stays open until the test settles it. */
function pendingTurn() {
  const turn: {
    emit: (event: PracticeEvent) => void;
    finish: () => void;
    signal: AbortSignal | undefined;
  } = { emit: () => undefined, finish: () => undefined, signal: undefined };
  stream.mockImplementation(
    (_path, _body, onEvent, signal) =>
      new Promise<void>((resolve) => {
        turn.signal = signal;
        turn.emit = (event) => {
          onEvent(event);
        };
        turn.finish = resolve;
      }),
  );
  return turn;
}

const room = () => renderHook(() => usePracticeRoom({ skill: "pitching", resume: active() }));

beforeEach(() => {
  stream.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("usePracticeRoom", () => {
  it("starts one turn for a double Enter or double click on Send", () => {
    pendingTurn();
    const { result } = room();
    act(() => {
      result.current.editDraft("Hello there");
    });
    act(() => {
      result.current.send();
      result.current.send();
    });
    act(() => {
      result.current.send();
    });
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it("is free for the next turn as soon as the reply is done", () => {
    const turn = pendingTurn();
    const { result } = room();
    act(() => {
      result.current.editDraft("First");
    });
    act(() => {
      result.current.send();
    });
    act(() => {
      turn.emit({ type: "done", stage: "discovery", turnsLeft: 19, finalText: "Go on." });
    });
    // The stream promise hasn't settled yet; the next Send must still go out.
    act(() => {
      result.current.editDraft("Second");
    });
    act(() => {
      result.current.send();
    });
    expect(stream).toHaveBeenCalledTimes(2);
  });

  it("aborts the reply in flight when the room goes away", () => {
    const turn = pendingTurn();
    const { result, unmount } = room();
    act(() => {
      result.current.editDraft("Hello");
    });
    act(() => {
      result.current.send();
    });
    expect(turn.signal?.aborted).toBe(false);
    unmount();
    expect(turn.signal?.aborted).toBe(true);
  });

  it("stops the room when another tab replaced the session", async () => {
    stream.mockRejectedValue(new ApiError(409, "conflict", "This practice session has ended"));
    serveApi({
      [`GET /api/practice/sessions/${ID}`]: () =>
        jsonResponse({ attempt: { ...active(), status: "abandoned" } }),
    });
    const { result } = room();
    act(() => {
      result.current.editDraft("Hello");
    });
    await act(async () => {
      result.current.send();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.state).toMatchObject({ status: "ended", endedReason: "replaced" });
  });

  it("keeps the room on a 409 while the same session is still busy", async () => {
    stream.mockRejectedValue(new ApiError(409, "conflict", "Wait for the reply"));
    serveApi({
      [`GET /api/practice/sessions/${ID}`]: () => jsonResponse({ attempt: active() }),
    });
    const { result } = room();
    act(() => {
      result.current.editDraft("Hello");
    });
    await act(async () => {
      result.current.send();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.state).toMatchObject({
      status: "ready",
      error: { message: "Still working on the last reply" },
    });
  });
});
