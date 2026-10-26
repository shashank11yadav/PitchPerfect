import type { ApplicationStatus } from "@pitchperfect/shared";
import type { EmployerApplicationView } from "@pitchperfect/shared";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrf } from "@/lib/api";
import { ProvideSession } from "@/lib/session";
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
import {
  APPLICATION_ID,
  applicant,
  company,
  employerSession,
  sharedScorecard,
} from "./test-fixtures";

const BASE = `/api/employer/applications/${APPLICATION_ID}`;
const SCORECARD = `GET ${BASE}/scorecard`;

beforeEach(() => {
  resetCsrf();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup(view = applicant(), routes: Record<string, Route> = {}, owner = company()) {
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
    <ProvideSession session={employerSession(owner)}>
      <ApplicantDrawer
        application={view}
        jobTitle="Sales development representative"
        onChange={onChange}
      />
    </ProvideSession>,
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
    expect(screen.getByText("Riley’s application has no résumé.")).toBeVisible();
  });

  it("says how long a decided application's résumé stays downloadable", () => {
    setup(applicant({ status: "rejected", hasResume: true }));
    expect(screen.getByRole("link", { name: /Download résumé/ })).toBeVisible();
    expect(
      screen.getByText(/until 7 days after the application was decided or closed/),
    ).toBeVisible();
  });

  it.each(["hired", "rejected", "closed"] as const)(
    "hides the download once the api stops serving the résumé of a %s application",
    (status) => {
      setup(applicant({ status, hasResume: false }));
      expect(screen.queryByRole("link", { name: /résumé/i })).not.toBeInTheDocument();
      expect(
        screen.getByText(
          "No résumé to download. Résumés stay available for 7 days after an application is decided or closed.",
        ),
      ).toBeVisible();
    },
  );

  it("offers no invite to an unverified company and says why", () => {
    setup(applicant({ status: "shortlisted" }), {}, company({ verification: "unverified" }));
    expect(actionNames()).toEqual(["Not a fit"]);
    expect(screen.getByText(/Only verified companies can send interview invites/)).toBeVisible();
    expect(screen.getByRole("link", { name: "See how to get verified" })).toHaveAttribute(
      "href",
      "/employer/company",
    );
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

  it("says how many turns the score rests on, who answered, and for how long", async () => {
    setup(applicant({ hasSharedScorecard: true }));
    const facts = await screen.findByText("Riley’s turns");
    const list = facts.closest("dl");
    if (!(list instanceof HTMLElement)) throw new Error("no facts list");
    expect(list).toHaveTextContent("Riley’s turns6");
    expect(list).toHaveTextContent("PartnerAI practice partner");
    expect(list).toHaveTextContent("Call length4 min 10 s");
    expect(screen.queryByText(/A short call/)).not.toBeInTheDocument();
  });

  it("marks a scripted call, and a short one shared before the minimum", async () => {
    setup(applicant({ hasSharedScorecard: true }), {
      [SCORECARD]: () =>
        jsonResponse(
          sharedScorecard({ studentTurns: 2, partner: "scripted", durationSeconds: 45 }),
        ),
    });
    expect(await screen.findByText("Scripted demo partner")).toBeVisible();
    expect(screen.getByText("45 s")).toBeVisible();
    expect(screen.getByText(/fixed set of lines/)).toBeVisible();
    expect(
      screen.getByText(/A short call: Riley shared it before a scorecard needed at least 4 turns/),
    ).toBeVisible();
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

/** The drawer as its list holds it: the application it shows follows each change. */
function Pipeline({ start }: { start: EmployerApplicationView }) {
  const [view, setView] = useState(start);
  return (
    <ApplicantDrawer
      application={view}
      jobTitle="Sales development representative"
      onChange={setView}
    />
  );
}

function setupLive(view = applicant()) {
  serveApi({
    "GET /api/auth/csrf": csrf,
    [`PATCH ${BASE}`]: (init) =>
      jsonResponse({ application: { ...view, ...(bodyOf(init) as object), interview: null } }),
    [`POST ${BASE}/interview`]: (init) =>
      jsonResponse({ application: { ...view, status: "interview", interview: bodyOf(init) } }),
  });
  render(
    <ProvideSession session={employerSession()}>
      <Pipeline start={view} />
    </ProvideSession>,
  );
}

const statusLine = () => screen.getByTestId("applicant-status");

describe("ApplicantDrawer after a move", () => {
  it("puts focus on the new status and announces it after a shortlist", async () => {
    setupLive();
    await userEvent.click(screen.getByRole("button", { name: "Shortlist" }));
    await waitFor(() => {
      expect(statusLine()).toHaveFocus();
    });
    expect(statusLine()).toHaveTextContent("Shortlisted");
    expect(screen.getByRole("status")).toHaveTextContent("Riley is shortlisted.");
  });

  it("lands on the status, not the vanished button, after confirming a rejection", async () => {
    setupLive();
    const trigger = screen.getByRole("button", { name: "Not a fit" });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Mark as not a fit" }));
    await waitFor(() => {
      expect(statusLine()).toHaveFocus();
    });
    expect(trigger).not.toBeInTheDocument();
    expect(statusLine()).toHaveTextContent("Not a fit");
    expect(screen.getByRole("status")).toHaveTextContent("Riley is marked as not a fit.");
  });

  it("does the same after hiring", async () => {
    setupLive(
      applicant({
        status: "interview",
        interview: {
          startsAt: "2026-11-03T15:30:00.000Z",
          meetingUrl: "https://meet.example.test/a",
        },
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Hire" }));
    await userEvent.click(screen.getByRole("button", { name: "Mark as hired" }));
    await waitFor(() => {
      expect(statusLine()).toHaveFocus();
    });
    expect(screen.getByRole("status")).toHaveTextContent("Riley is marked as hired.");
  });

  it("announces a booked interview and focuses the status", async () => {
    setupLive(applicant({ status: "shortlisted" }));
    await userEvent.click(screen.getByRole("button", { name: "Schedule interview" }));
    fireEvent.change(screen.getByLabelText(/Date and time/), {
      target: { value: "2030-11-02T15:00" },
    });
    await userEvent.type(screen.getByLabelText(/Meeting link/), "https://meet.example.test/riley");
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));
    await waitFor(() => {
      expect(statusLine()).toHaveFocus();
    });
    expect(screen.getByRole("status")).toHaveTextContent(/Interview booked for .*2030/);
  });
});
