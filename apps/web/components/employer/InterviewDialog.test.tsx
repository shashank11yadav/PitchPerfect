import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrf } from "@/lib/api";
import {
  bodyOf,
  callsTo,
  csrf,
  errorResponse,
  jsonResponse,
  lastBody,
  serveApi,
  type Route,
} from "@/lib/test-api";
import { InterviewDialog } from "./InterviewDialog";
import { APPLICATION_ID, applicant } from "./test-fixtures";

const INTERVIEW = `POST /api/employer/applications/${APPLICATION_ID}/interview`;

const zone = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/New_York";
});
afterAll(() => {
  process.env.TZ = zone;
});

beforeEach(() => {
  resetCsrf();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T16:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup(view = applicant({ status: "shortlisted" }), route?: Route) {
  const fetchMock = serveApi({
    "GET /api/auth/csrf": csrf,
    [INTERVIEW]:
      route ??
      ((init) => {
        const body = bodyOf(init) as { startsAt: string; meetingUrl: string };
        return jsonResponse({ application: { ...view, status: "interview", interview: body } });
      }),
  });
  const onScheduled = vi.fn();
  const onClose = vi.fn();
  render(<InterviewDialog open application={view} onClose={onClose} onScheduled={onScheduled} />);
  return { fetchMock, onScheduled, onClose };
}

/** jsdom has no picker for datetime-local, so the value is set the way a picker would. */
function pickTime(value: string) {
  fireEvent.change(screen.getByLabelText(/Date and time/), { target: { value } });
}

describe("InterviewDialog", () => {
  it("sends 3:00 PM New York time on Nov 2, 2026 as 20:00 UTC", async () => {
    const { fetchMock, onScheduled } = setup();
    expect(screen.getByRole("dialog", { name: "Schedule an interview with Riley" })).toBeVisible();
    pickTime("2026-11-02T15:00");
    await userEvent.type(screen.getByLabelText(/Meeting link/), "https://meet.example.test/riley");
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));
    await waitFor(() => {
      expect(onScheduled).toHaveBeenCalledWith(expect.objectContaining({ status: "interview" }));
    });
    expect(lastBody(fetchMock, INTERVIEW)).toEqual({
      startsAt: "2026-11-02T20:00:00.000Z",
      meetingUrl: "https://meet.example.test/riley",
    });
  });

  it("names the viewer's time zone next to the time", () => {
    setup();
    expect(screen.getByText(/America\/New_York/)).toBeInTheDocument();
  });

  it("refuses a time that has already passed", async () => {
    const { fetchMock } = setup();
    pickTime("2026-10-20T09:00");
    await userEvent.type(screen.getByLabelText(/Meeting link/), "https://meet.example.test/riley");
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));
    expect(await screen.findByText("Pick a time that hasn’t passed yet")).toBeVisible();
    expect(callsTo(fetchMock, INTERVIEW)).toBe(0);
  });

  it("refuses a time the clocks skip in spring", async () => {
    const { fetchMock } = setup();
    pickTime("2027-03-14T02:30");
    await userEvent.type(screen.getByLabelText(/Meeting link/), "https://meet.example.test/riley");
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));
    expect(await screen.findByText("That time doesn’t exist on this day")).toBeVisible();
    expect(callsTo(fetchMock, INTERVIEW)).toBe(0);
  });

  it("asks for a time and an https meeting link", async () => {
    const { fetchMock } = setup();
    await userEvent.type(screen.getByLabelText(/Meeting link/), "http://meet.example.test/riley");
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));
    expect(await screen.findByText("Pick a date and time")).toBeVisible();
    expect(screen.getByLabelText(/Meeting link/)).toHaveAccessibleDescription(/https:\/\//);
    expect(callsTo(fetchMock, INTERVIEW)).toBe(0);
  });

  it("offers to move an interview that's already booked, starting from its time and link", async () => {
    const view = applicant({
      status: "interview",
      interview: {
        startsAt: "2026-11-03T15:30:00.000Z",
        meetingUrl: "https://meet.example.test/a",
      },
    });
    const { fetchMock, onScheduled } = setup(view);
    expect(screen.getByRole("dialog", { name: "Move Riley’s interview" })).toBeVisible();
    expect(screen.getByLabelText(/Date and time/)).toHaveValue("2026-11-03T10:30");
    expect(screen.getByLabelText(/Meeting link/)).toHaveValue("https://meet.example.test/a");
    pickTime("2026-11-04T11:00");
    await userEvent.click(screen.getByRole("button", { name: "Send the new time" }));
    await waitFor(() => {
      expect(onScheduled).toHaveBeenCalled();
    });
    expect(lastBody(fetchMock, INTERVIEW)).toMatchObject({ startsAt: "2026-11-04T16:00:00.000Z" });
  });

  it("shows the api's reason when it refuses", async () => {
    setup(applicant({ status: "shortlisted" }), () =>
      errorResponse(403, "email_not_verified", "Confirm your email first"),
    );
    pickTime("2026-11-02T15:00");
    await userEvent.type(screen.getByLabelText(/Meeting link/), "https://meet.example.test/riley");
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/confirm your email/i);
  });
});
