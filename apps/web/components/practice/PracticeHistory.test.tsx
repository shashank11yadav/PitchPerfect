import type { AttemptSummary } from "@pitchperfect/shared";
import { render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { pageOf } from "@/components/student/test-fixtures";
import { jsonResponse, serveApi } from "@/lib/test-api";
import { PracticeHistory } from "./PracticeHistory";
import { trendSummary } from "./ScoreTrend";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const zone = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/New_York";
});
afterAll(() => {
  process.env.TZ = zone;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

let serial = 0;
function attempt(overrides: Partial<AttemptSummary>): AttemptSummary {
  serial += 1;
  return {
    id: `65f1c0ffee00000000000c${String(serial).padStart(2, "0")}`,
    skill: "pitching",
    status: "completed",
    overall: 60,
    startedAt: "2026-10-10T15:00:00.000Z",
    endedAt: "2026-10-10T15:10:00.000Z",
    ...overrides,
  };
}

const newestFirst = [
  attempt({ overall: 72, startedAt: "2026-10-19T15:00:00.000Z" }),
  attempt({ skill: "next-steps", status: "abandoned", overall: null }),
  attempt({ status: "ended_by_guard", overall: null, startedAt: "2026-10-15T15:00:00.000Z" }),
  attempt({ overall: 61, startedAt: "2026-10-12T15:00:00.000Z" }),
  attempt({ overall: 54, startedAt: "2026-10-08T15:00:00.000Z" }),
];

describe("trendSummary", () => {
  it("describes the trend in words", () => {
    expect(trendSummary("Pitching", [54, 61, 72])).toBe(
      "Pitching: 3 scored sessions, from 54 to 72.",
    );
    expect(trendSummary("Next steps", [64])).toBe("Next steps: 1 scored session, 64.");
    expect(trendSummary("Pitching", [72, 72])).toBe("Pitching: 2 scored sessions, steady at 72.");
  });
});

describe("PracticeHistory", () => {
  it("lists sessions with their score or what happened, and a trend per skill", async () => {
    serveApi({
      "GET /api/practice/attempts?page=1": () => jsonResponse(pageOf(newestFirst)),
      "GET /api/practice/attempts?pageSize=50": () => jsonResponse(pageOf(newestFirst)),
    });
    render(<PracticeHistory page={1} />);

    const list = await screen.findByRole("list", { name: "Practice sessions" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent(/Pitching.*Oct 19, 2026.*72/);
    const [newest] = rows;
    if (!newest) throw new Error("no rows");
    expect(within(newest).getByRole("link")).toHaveAttribute(
      "href",
      `/app/practice/attempt/${newestFirst[0]?.id ?? ""}`,
    );
    expect(rows[1]).toHaveTextContent("Not scored");
    expect(rows[2]).toHaveTextContent("Ended early");

    expect(
      await screen.findByText("Pitching: 3 scored sessions, from 54 to 72."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Next steps:/)).toBeNull();
  });

  it("filters by skill", async () => {
    const fetchMock = serveApi({
      "GET /api/practice/attempts?page=1&skill=pitching": () => jsonResponse(pageOf([])),
      "GET /api/practice/attempts?pageSize=50&skill=pitching": () => jsonResponse(pageOf([])),
    });
    render(<PracticeHistory page={1} skill="pitching" />);
    expect(await screen.findByText(/haven’t practiced pitching yet/i)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Skill" })).toHaveValue("pitching");
    // No trends to draw for an empty list.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("points a new student at the practice page", async () => {
    serveApi({
      "GET /api/practice/attempts?page=1": () => jsonResponse(pageOf([])),
      "GET /api/practice/attempts?pageSize=50": () => jsonResponse(pageOf([])),
    });
    render(<PracticeHistory page={1} />);
    expect(await screen.findByRole("link", { name: "Pick a skill" })).toHaveAttribute(
      "href",
      "/app/practice",
    );
  });
});
