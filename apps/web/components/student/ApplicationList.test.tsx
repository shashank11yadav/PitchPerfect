import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrf } from "@/lib/api";
import { callsTo, csrf, jsonResponse, serveApi, type Route } from "@/lib/test-api";
import { ApplicationList } from "./ApplicationList";
import { application, pageOf } from "./test-fixtures";

const LIST = "GET /api/me/applications?page=1";
const ID = "65f1c0ffee00000000000a01";

const zone = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/New_York";
});
afterAll(() => {
  process.env.TZ = zone;
});

beforeEach(() => {
  resetCsrf();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function show(items: ReturnType<typeof application>[], routes: Record<string, Route> = {}) {
  const fetchMock = serveApi({
    [LIST]: () => jsonResponse(pageOf(items)),
    "GET /api/auth/csrf": csrf,
    ...routes,
  });
  render(<ApplicationList page={1} />);
  return fetchMock;
}

const row = async (title: string) =>
  (await screen.findByRole("heading", { name: title })).closest("li") as HTMLElement;

describe("ApplicationList", () => {
  it("shows the interview in the viewer's own time zone, with the zone's name, and the link", async () => {
    show([
      application({
        status: "interview",
        interview: {
          startsAt: "2026-11-03T15:30:00.000Z",
          meetingUrl: "https://meet.example.test/quarrow-sdr",
        },
      }),
    ]);
    const item = await row("Sales development representative");
    expect(within(item).getByText("Tuesday, November 3, 2026 at 10:30 AM EST")).toBeInTheDocument();
    const link = within(item).getByRole("link", { name: /join the interview/i });
    expect(link).toHaveAttribute("href", "https://meet.example.test/quarrow-sdr");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("says why the system closed an application", async () => {
    show([
      application({ id: "a".repeat(24), status: "closed", closedReason: "employer_left" }),
      application({
        id: "b".repeat(24),
        status: "closed",
        closedReason: "job_archived",
        job: { id: "c".repeat(24), slug: null, title: "Account executive", companyName: "Fenwick" },
      }),
    ]);
    expect(
      within(await row("Sales development representative")).getByText(
        /The employer left PitchPerfect/,
      ),
    ).toBeInTheDocument();
    expect(within(await row("Account executive")).getByText(/This job was archived/)).toBeVisible();
  });

  it("links to the job only while it's still listed, and names the company from the snapshot", async () => {
    show([
      application({ id: "a".repeat(24) }),
      application({
        id: "b".repeat(24),
        status: "rejected",
        job: { id: "c".repeat(24), slug: null, title: "Account executive", companyName: "Fenwick" },
      }),
    ]);
    const listed = await row("Sales development representative");
    expect(
      within(listed).getByRole("link", { name: "Sales development representative" }),
    ).toHaveAttribute("href", "/app/jobs/sales-development-representative-a1b2c3");
    const gone = await row("Account executive");
    expect(within(gone).queryByRole("link")).not.toBeInTheDocument();
    expect(within(gone).getByText("Fenwick")).toBeInTheDocument();
  });

  it("only offers withdraw while the application is open", async () => {
    show(
      (
        ["applied", "shortlisted", "interview", "hired", "rejected", "withdrawn", "closed"] as const
      ).map((status, index) =>
        application({
          id: String(index).repeat(24),
          status,
          job: {
            id: String(index).repeat(24),
            slug: null,
            title: `Role ${String(index)}`,
            companyName: "Fenwick",
          },
        }),
      ),
    );
    const offered = [];
    for (let index = 0; index < 7; index++) {
      const item = await row(`Role ${String(index)}`);
      if (within(item).queryByRole("button", { name: /withdraw/i })) offered.push(index);
    }
    expect(offered).toEqual([0, 1, 2]);
  });

  it("asks before withdrawing, and does nothing if the student keeps it", async () => {
    const fetchMock = show([application()]);
    const item = await row("Sales development representative");
    await userEvent.click(within(item).getByRole("button", { name: /withdraw/i }));

    const dialog = screen.getByRole("dialog", { name: "Withdraw this application?" });
    expect(dialog).toHaveTextContent("Quarrow Logistics Software");
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep it" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(callsTo(fetchMock, `POST /api/applications/${ID}/withdraw`)).toBe(0);
  });

  it("withdraws on confirm and shows the new status", async () => {
    const fetchMock = show([application()], {
      [`POST /api/applications/${ID}/withdraw`]: () =>
        jsonResponse({ application: application({ status: "withdrawn" }) }),
    });
    const item = await row("Sales development representative");
    await userEvent.click(within(item).getByRole("button", { name: /withdraw/i }));
    await userEvent.click(screen.getByRole("button", { name: "Withdraw application" }));

    await waitFor(() => {
      expect(within(item).getByText("Withdrawn")).toBeInTheDocument();
    });
    expect(callsTo(fetchMock, `POST /api/applications/${ID}/withdraw`)).toBe(1);
    expect(within(item).queryByRole("button", { name: /withdraw/i })).not.toBeInTheDocument();
  });

  it("has a real empty state with somewhere to go", async () => {
    show([]);
    expect(await screen.findByRole("heading", { name: /haven.t applied/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse jobs" })).toHaveAttribute("href", "/app/jobs");
  });
});
