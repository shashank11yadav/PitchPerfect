import type { ApplicationStatus } from "@pitchperfect/shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { ApplicantDrawer, employerActions } from "./ApplicantDrawer";
import { APPLICATION_ID, applicant, sharedScorecard } from "./test-fixtures";

const BASE = `/api/employer/applications/${APPLICATION_ID}`;
const SCORECARD = `GET ${BASE}/scorecard`;

beforeEach(() => {
  resetCsrf();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup(view = applicant(), routes: Record<string, Route> = {}) {
  const fetchMock = serveApi({
    "GET /api/auth/csrf": csrf,
    [`PATCH ${BASE}`]: (init) =>
      jsonResponse({ application: { ...view, ...(bodyOf(init) as object), interview: null } }),
    [`PUT ${BASE}/save`]: () => new Response(null, { status: 204 }),
    [`DELETE ${BASE}/save`]: () => new Response(null, { status: 204 }),
    [SCORECARD]: () => jsonResponse(sharedScorecard()),
    ...routes,
  });
  const onChange = vi.fn();
  render(
    <ApplicantDrawer
      application={view}
      jobTitle="Sales development representative"
      onChange={onChange}
      onClose={vi.fn()}
    />,
  );
  return { fetchMock, onChange };
}

const actions = () => within(screen.getByRole("group", { name: "Move this application" }));
const actionNames = () =>
  actions()
    .queryAllByRole("button")
    .map((button) => button.textContent);

describe("employerActions", () => {
  it("follows the shared transitions without ever offering interview as a plain status", () => {
    expect(employerActions("applied")).toEqual(["shortlisted", "rejected"]);
    expect(employerActions("shortlisted")).toEqual(["rejected"]);
    expect(employerActions("interview")).toEqual(["hired", "rejected"]);
    for (const status of ["hired", "rejected", "withdrawn", "closed"] as ApplicationStatus[]) {
      expect(employerActions(status)).toEqual([]);
    }
  });
});

describe("ApplicantDrawer", () => {
  it("shows the profile the api shares and nothing else", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Riley Hartwell" })).toBeVisible();
    expect(screen.getByText(/Lakeview State University/)).toBeVisible();
    expect(screen.getByText(/Marketing/)).toBeVisible();
    expect(screen.getByText(/2027/)).toBeVisible();
  });

  it("offers shortlist and reject for a new application, and no interview yet", () => {
    setup();
    expect(actionNames()).toEqual(["Shortlist", "Not a fit"]);
    expect(screen.queryByRole("button", { name: /interview/i })).not.toBeInTheDocument();
  });

  it("offers scheduling from the shortlist, through the dialog only", async () => {
    setup(applicant({ status: "shortlisted" }));
    expect(actionNames()).toEqual(["Schedule interview", "Not a fit"]);
    await userEvent.click(screen.getByRole("button", { name: "Schedule interview" }));
    expect(screen.getByRole("dialog", { name: /Schedule an interview/ })).toBeVisible();
  });

  it("offers hire, reject and a new time once the interview is booked", () => {
    setup(
      applicant({
        status: "interview",
        interview: {
          startsAt: "2026-11-03T15:30:00.000Z",
          meetingUrl: "https://meet.example.test/a",
        },
      }),
    );
    expect(actionNames()).toEqual(["Reschedule", "Hire", "Not a fit"]);
    expect(screen.getByRole("link", { name: /Meeting link/ })).toHaveAttribute(
      "href",
      "https://meet.example.test/a",
    );
  });

  it.each(["hired", "rejected", "closed", "withdrawn"] as const)(
    "has no status actions once the application is %s",
    (status) => {
      setup(applicant({ status }));
      expect(
        screen.queryByRole("group", { name: "Move this application" }),
      ).not.toBeInTheDocument();
    },
  );

  it("shortlists with a plain status change and reports the new view", async () => {
    const { fetchMock, onChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Shortlist" }));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: "shortlisted" }));
    });
    expect(lastBody(fetchMock, `PATCH ${BASE}`)).toEqual({ status: "shortlisted" });
  });

  it("asks before a rejection, which can't be undone", async () => {
    const { fetchMock, onChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Not a fit" }));
    const dialog = screen.getByRole("dialog", { name: "Mark Riley as not a fit?" });
    expect(dialog).toHaveTextContent(/Not selected/);
    expect(callsTo(fetchMock, `PATCH ${BASE}`)).toBe(0);
    await userEvent.click(within(dialog).getByRole("button", { name: "Mark as not a fit" }));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: "rejected" }));
    });
  });

  it("links the résumé as a download only when there is one", () => {
    setup(applicant({ hasResume: true }));
    const link = screen.getByRole("link", { name: /Download résumé/ });
    expect(link).toHaveAttribute("href", `${BASE}/resume`);
    expect(link).toHaveAttribute("download");
  });

  it("says when there's no résumé", () => {
    setup();
    expect(screen.queryByRole("link", { name: /résumé/i })).not.toBeInTheDocument();
    expect(screen.getByText(/hasn’t uploaded a résumé/)).toBeVisible();
  });

  it("shows a shared scorecard read-only", async () => {
    const { fetchMock } = setup(applicant({ hasSharedScorecard: true }));
    expect(await screen.findByText("You asked how they track delays now.")).toBeVisible();
    expect(screen.getAllByText("How do you track delays today?").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: /practice again|delete|share/i }),
    ).not.toBeInTheDocument();
    expect(callsTo(fetchMock, SCORECARD)).toBe(1);
  });

  it("doesn't ask for a scorecard that wasn't shared", () => {
    const { fetchMock } = setup();
    expect(screen.getByText("No scorecard shared")).toBeVisible();
    expect(callsTo(fetchMock, SCORECARD)).toBe(0);
  });

  it("treats a scorecard that's gone as not shared", async () => {
    setup(applicant({ hasSharedScorecard: true }), {
      [SCORECARD]: () => errorResponse(404, "not_shared", "No scorecard has been shared"),
    });
    expect(await screen.findByText("No scorecard shared")).toBeVisible();
  });

  it("hides the résumé and scorecard of a withdrawn application", () => {
    const { fetchMock } = setup(
      applicant({ status: "withdrawn", hasResume: true, hasSharedScorecard: true }),
    );
    expect(screen.queryByRole("link", { name: /résumé/i })).not.toBeInTheDocument();
    expect(screen.getByText(/withdrew/)).toBeVisible();
    expect(callsTo(fetchMock, SCORECARD)).toBe(0);
  });

  it("saves and unsaves the applicant", async () => {
    const { fetchMock, onChange } = setup();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(save);
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ savedByEmployer: true }));
    });
    expect(callsTo(fetchMock, `PUT ${BASE}/save`)).toBe(1);
  });
});
