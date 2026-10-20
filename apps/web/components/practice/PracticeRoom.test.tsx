import type { AttemptView, PracticeEvent } from "@pitchperfect/shared";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiStream } from "@/lib/api";
import { pageOf, renderSignedIn, studentMe } from "@/components/student/test-fixtures";
import {
  bodyOf,
  callsTo,
  csrf,
  errorResponse,
  jsonResponse,
  serveApi,
  type Route,
} from "@/lib/test-api";
import { PracticeRoom } from "./PracticeRoom";
import { completedAttempt } from "./test-fixtures";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiStream: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/app/practice/attempt/65f1c0ffee00000000000b01",
}));

const stream = vi.mocked(apiStream);

function activeAttempt(overrides: Partial<AttemptView> = {}): AttemptView {
  return {
    ...completedAttempt(),
    status: "active",
    stage: "opening",
    transcript: [],
    scorecard: null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    ...overrides,
  };
}

/** Lets the test push events into the turn that is in flight, then finish it. */
function controlStream() {
  const turn: { emit: (event: PracticeEvent) => void; finish: () => void; fail: () => void } = {
    emit: () => undefined,
    finish: () => undefined,
    fail: () => undefined,
  };
  stream.mockImplementation(
    (_path, _body, onEvent) =>
      new Promise<void>((resolve, reject) => {
        turn.emit = (event) => {
          act(() => {
            onEvent(event);
          });
        };
        turn.finish = resolve;
        turn.fail = () => {
          reject(new Error("connection lost"));
        };
      }),
  );
  return turn;
}

beforeEach(() => {
  stream.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PracticeRoom", () => {
  it("shows who the student is talking to, the opening line, and the session's progress", () => {
    render(<PracticeRoom attempt={activeAttempt()} />);
    expect(screen.getByRole("region", { name: "Dana Ruiz" })).toHaveTextContent(
      "AI practice partner",
    );
    const transcript = screen.getByRole("list", { name: "Transcript" });
    expect(transcript).toHaveTextContent("Dana Ruiz said: You have two minutes.");
    expect(screen.getByRole("list", { name: "Conversation stages" })).toBeInTheDocument();
    expect(screen.getByText("20 turns left")).toBeInTheDocument();
    expect(screen.getByText(/^(20:00|19:5\d) left$/)).toBeInTheDocument();
  });

  it("sends on Enter and streams the reply into a polite live region", async () => {
    const user = userEvent.setup();
    const turn = controlStream();
    render(<PracticeRoom attempt={activeAttempt()} />);

    const box = screen.getByRole("textbox", { name: "Your turn" });
    await user.type(box, "I can save your dispatchers an hour a day.{Enter}");

    expect(stream).toHaveBeenCalledTimes(1);
    expect(stream.mock.calls[0]?.[0]).toBe("/practice/sessions/65f1c0ffee00000000000b01/turns");
    expect(stream.mock.calls[0]?.[1]).toEqual({
      text: "I can save your dispatchers an hour a day.",
    });
    expect(box).toHaveValue("");
    expect(screen.getByRole("list", { name: "Transcript" })).toHaveTextContent(
      "You said: I can save your dispatchers an hour a day.",
    );

    turn.emit({ type: "delta", text: "An hour? " });
    turn.emit({ type: "delta", text: "Doing what" });
    const live = document.querySelector('[aria-live="polite"][data-live="reply"]');
    if (!(live instanceof HTMLElement)) throw new Error("no live region");
    expect(live).toHaveTextContent("An hour? Doing what");

    turn.emit({
      type: "done",
      stage: "discovery",
      turnsLeft: 19,
      finalText: "An hour? Doing what, exactly?",
    });
    await act(async () => {
      turn.finish();
      await Promise.resolve();
    });
    expect(live).not.toHaveTextContent("Doing what");
    expect(screen.getByRole("list", { name: "Transcript" })).toHaveTextContent(
      "Dana Ruiz said: An hour? Doing what, exactly?",
    );
    expect(screen.getByText("19 turns left")).toBeInTheDocument();
  });

  it("adds a line on Shift+Enter instead of sending", async () => {
    const user = userEvent.setup();
    render(<PracticeRoom attempt={activeAttempt()} />);
    const box = screen.getByRole("textbox", { name: "Your turn" });
    await user.type(box, "First line{Shift>}{Enter}{/Shift}second line");
    expect(stream).not.toHaveBeenCalled();
    expect(box).toHaveValue("First line\nsecond line");
  });

  it("keeps the line for a retry when the reply is cut off", async () => {
    const user = userEvent.setup();
    const turn = controlStream();
    render(<PracticeRoom attempt={activeAttempt()} />);
    const box = screen.getByRole("textbox", { name: "Your turn" });
    await user.type(box, "We plan loads overnight.{Enter}");
    turn.emit({ type: "delta", text: "Overnight? We" });

    await act(async () => {
      turn.fail();
      await Promise.resolve();
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Reply interrupted — try again");
    expect(box).toHaveValue("We plan loads overnight.");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(stream).toHaveBeenCalledTimes(2);
    const students = within(screen.getByRole("list", { name: "Transcript" })).getAllByText(
      "We plan loads overnight.",
    );
    expect(students).toHaveLength(1);
  });

  it("starts in typing mode with a notice when the browser can't listen", () => {
    render(<PracticeRoom attempt={activeAttempt()} />);
    expect(screen.queryByRole("button", { name: /hold to talk/i })).not.toBeInTheDocument();
    expect(screen.getByText(/can’t turn speech into text/)).toBeInTheDocument();
  });

  it("ends after a confirm and shows the scorecard", async () => {
    const user = userEvent.setup();
    const fetchMock = serveApi({
      "GET /api/auth/csrf": csrf,
      "POST /api/practice/sessions/65f1c0ffee00000000000b01/end": () =>
        jsonResponse({ attempt: completedAttempt() }),
      "GET /api/me/applications?pageSize=50": () =>
        jsonResponse({ items: [], page: 1, pageSize: 50, total: 0 }),
    });
    render(<PracticeRoom attempt={activeAttempt()} />);

    await user.click(screen.getByRole("button", { name: "End session" }));
    const dialog = screen.getByRole("dialog", { name: "End this session?" });
    await user.click(within(dialog).getByRole("button", { name: "End and score" }));

    expect(await screen.findByRole("img", { name: /^Overall score: 72 out of 100/ })).toBeVisible();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/practice/sessions/65f1c0ffee00000000000b01/end",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});

describe("PracticeRoom before the call", () => {
  const quota = {
    dailyUsed: 1,
    dailyLimit: 5,
    monthlyUsed: 4,
    monthlyLimit: 30,
    available: true,
    budgetExhausted: false,
    resetsAt: "2026-10-21T00:00:00.000Z",
  };

  function showLobby(routes: Record<string, Route>, props: { jobId?: string } = {}) {
    const fetchMock = serveApi({
      "GET /api/auth/csrf": csrf,
      "GET /api/auth/me": () => {
        const me = studentMe();
        return jsonResponse({
          ...me,
          user: { ...me.user, practiceConsentAt: "2026-10-01T00:00:00.000Z" },
        });
      },
      "GET /api/practice/quota": () => jsonResponse(quota),
      "GET /api/practice/attempts?pageSize=1": () => jsonResponse(pageOf([])),
      ...routes,
    });
    renderSignedIn(<PracticeRoom skill="objection-handling" {...props} />);
    return fetchMock;
  }

  it("never starts on its own: the student clicks Start", async () => {
    const fetchMock = showLobby({});
    expect(await screen.findByRole("button", { name: "Start the call" })).toBeEnabled();
    expect(callsTo(fetchMock, "POST /api/practice/sessions")).toBe(0);
    expect(screen.getByText(/Objection handling counts double/)).toBeInTheDocument();
  });

  it("sends the job along when practicing for one", async () => {
    const user = userEvent.setup();
    const fetchMock = showLobby(
      { "POST /api/practice/sessions": () => errorResponse(404, "not_found", "Not found") },
      { jobId: "65f1c0ffee0000000000abcd" },
    );
    await user.click(await screen.findByRole("button", { name: "Start the call" }));
    const start = fetchMock.mock.calls.find(([url]) => url === "/api/practice/sessions");
    expect(bodyOf(start?.[1])).toEqual({
      skill: "objection-handling",
      jobId: "65f1c0ffee0000000000abcd",
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(/job isn’t listed/);
  });

  it("explains a used-up quota with the local time it comes back", async () => {
    const user = userEvent.setup();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T16:00:00.000Z"));
    const zone = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      showLobby({
        "POST /api/practice/sessions": () =>
          errorResponse(429, "quota_exceeded", "Daily limit reached", {
            headers: { "retry-after": String(8 * 60 * 60) },
          }),
      });
      await user.click(await screen.findByRole("button", { name: "Start the call" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "You’ve used your practice sessions for now. You can start another today at 8:00 PM EDT.",
      );
    } finally {
      process.env.TZ = zone;
      vi.useRealTimers();
    }
  });

  it("explains a pause when the day's practice budget is spent", async () => {
    const user = userEvent.setup();
    showLobby({
      "POST /api/practice/sessions": () =>
        errorResponse(429, "budget_exhausted", "Paused", { headers: { "retry-after": "3600" } }),
    });
    await user.click(await screen.findByRole("button", { name: "Start the call" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/paused for everyone/);
  });

  it("offers to resume a session that's still running", async () => {
    showLobby({
      "GET /api/practice/attempts?pageSize=1": () =>
        jsonResponse(
          pageOf([
            {
              id: "65f1c0ffee00000000000b09",
              skill: "pitching",
              status: "active",
              overall: null,
              startedAt: new Date().toISOString(),
              endedAt: null,
            },
          ]),
        ),
    });
    expect(await screen.findByRole("link", { name: /Go back to it/ })).toHaveAttribute(
      "href",
      "/app/practice/attempt/65f1c0ffee00000000000b09",
    );
  });
});
