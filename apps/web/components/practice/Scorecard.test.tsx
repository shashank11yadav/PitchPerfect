import { computeOverall, RUBRIC_DIMENSIONS } from "@pitchperfect/shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { application, pageOf } from "@/components/student/test-fixtures";
import { bodyOf, callsTo, csrf, jsonResponse, serveApi, type Route } from "@/lib/test-api";
import { Scorecard } from "./Scorecard";
import { completedAttempt, SCORECARD } from "./test-fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

const ATTEMPT_ID = "65f1c0ffee00000000000b01";

function show(applications = [application()], routes: Record<string, Route> = {}) {
  const fetchMock = serveApi({
    "GET /api/auth/csrf": csrf,
    "GET /api/me/applications?pageSize=50": () =>
      jsonResponse(pageOf(applications, applications.length, 50)),
    ...routes,
  });
  render(<Scorecard attempt={completedAttempt()} />);
  return fetchMock;
}

describe("Scorecard", () => {
  it("is consistent with its own rubric", () => {
    expect(computeOverall(SCORECARD.dimensions, "value")).toBe(SCORECARD.overall);
  });

  it("shows the overall ring and seven labelled bars, the weighted one marked", () => {
    show();
    expect(
      screen.getByRole("img", { name: "Overall score: 72 out of 100, developing" }),
    ).toBeVisible();
    const meters = screen.getAllByRole("meter");
    expect(meters).toHaveLength(7);
    expect(screen.getByRole("meter", { name: "Clarity: 4 out of 5" })).toBeInTheDocument();
    expect(
      screen.getByRole("meter", { name: "Value & relevance: 5 out of 5" }),
    ).toBeInTheDocument();
    for (const { name } of RUBRIC_DIMENSIONS) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    const value = screen.getByRole("heading", { name: "Value & relevance" }).parentElement;
    expect(value).toHaveTextContent("Counts double");
  });

  it("quotes the evidence, or says there's no quote", () => {
    show();
    expect(screen.getByText("I can save your dispatchers an hour a day.")).toBeInTheDocument();
    expect(screen.getAllByText("No single line to quote")).toHaveLength(2);
  });

  it("lists strengths, improvements and the stronger version", () => {
    show();
    const strengths = screen.getByRole("list", { name: "Strengths" });
    expect(within(strengths).getAllByRole("listitem")).toHaveLength(3);
    const improvements = screen.getByRole("list", { name: "Improvements" });
    expect(within(improvements).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(SCORECARD.strongerLine.improved)).toBeInTheDocument();
  });

  it("links to practicing the same skill again", () => {
    show();
    expect(screen.getByRole("link", { name: "Practice again" })).toHaveAttribute(
      "href",
      "/app/practice/pitching",
    );
  });

  it("shares with an open application and can stop sharing", async () => {
    const user = userEvent.setup();
    const open = application();
    const fetchMock = show(
      [open, application({ id: "65f1c0ffee00000000000a02", status: "withdrawn" })],
      { [`PUT /api/applications/${open.id}/scorecard`]: shareAnswer(open.id) },
    );

    const select = await screen.findByRole("combobox", { name: "Application" });
    expect(within(select).getAllByRole("option")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => {
      expect(screen.getByText(/Shared with Sales development representative/)).toBeInTheDocument();
    });
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(put?.[0]).toBe(`/api/applications/${open.id}/scorecard`);
    expect(bodyOf(put?.[1])).toEqual({ attemptId: ATTEMPT_ID });

    await user.click(screen.getByRole("button", { name: /Stop sharing/ }));
    await waitFor(() => {
      expect(screen.queryByText(/Shared with Sales development representative/)).toBeNull();
    });
    const last = fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT").at(-1);
    expect(bodyOf(last?.[1])).toEqual({ attemptId: null });
  });

  it("says what to do when there's no open application", async () => {
    show([]);
    expect(await screen.findByText(/no open applications/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse jobs" })).toHaveAttribute("href", "/app/jobs");
  });

  it("deletes only after a confirm, then goes to the history", async () => {
    const user = userEvent.setup();
    const fetchMock = show([application()], {
      [`DELETE /api/practice/attempts/${ATTEMPT_ID}`]: () => new Response(null, { status: 204 }),
    });

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete this session?" });
    await user.click(within(dialog).getByRole("button", { name: "Keep it" }));
    expect(callsTo(fetchMock, `DELETE /api/practice/attempts/${ATTEMPT_ID}`)).toBe(0);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete session" }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/app/history");
    });
    expect(callsTo(fetchMock, `DELETE /api/practice/attempts/${ATTEMPT_ID}`)).toBe(1);
  });
});

/** Answers the share PUT with the application as the api would store it. */
const shareAnswer =
  (id: string): Route =>
  (init) => {
    const { attemptId } = bodyOf(init) as { attemptId: string | null };
    return jsonResponse({
      application: application({
        id,
        sharedAttemptId: attemptId,
        hasSharedScorecard: attemptId !== null,
      }),
    });
  };
