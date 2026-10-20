import type { AttemptSummary } from "@pitchperfect/shared";
import { render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { errorResponse, jsonResponse, serveApi, type Route } from "@/lib/test-api";
import { DashboardSummary } from "./DashboardSummary";
import { application, pageOf } from "./test-fixtures";

const zone = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/New_York";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T16:00:00.000Z"));
});
afterAll(() => {
  vi.useRealTimers();
  process.env.TZ = zone;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const attempt = (overrides: Partial<AttemptSummary>): AttemptSummary => ({
  id: "65f1c0ffee00000000000b01",
  skill: "pitching",
  status: "completed",
  overall: 72,
  startedAt: "2026-10-19T15:00:00.000Z",
  endedAt: "2026-10-19T15:12:00.000Z",
  ...overrides,
});

const QUOTA = {
  dailyUsed: 2,
  dailyLimit: 5,
  monthlyUsed: 7,
  monthlyLimit: 30,
  available: true,
  budgetExhausted: false,
  resetsAt: "2026-10-21T00:00:00.000Z",
};

function show(routes: Partial<Record<string, Route>> = {}) {
  serveApi({
    "GET /api/me/lessons": () => jsonResponse({ completed: ["introducing-yourself"] }),
    "GET /api/practice/quota": () => jsonResponse(QUOTA),
    "GET /api/practice/attempts?page=1": () => jsonResponse(pageOf([])),
    "GET /api/me/applications?pageSize=50": () => jsonResponse(pageOf([])),
    ...(routes as Record<string, Route>),
  });
  render(<DashboardSummary />);
}

async function card(name: string): Promise<HTMLElement> {
  const section = (await screen.findByRole("heading", { name })).closest("section");
  if (!section) throw new Error(`no section around "${name}"`);
  return section;
}

describe("DashboardSummary", () => {
  it("recommends the first lesson not yet done", async () => {
    show();
    const next = await card("Next lesson");
    expect(await within(next).findByRole("link", { name: /pitching/i })).toHaveAttribute(
      "href",
      "/app/learn/pitching",
    );
  });

  it("says when every lesson is done", async () => {
    show({
      "GET /api/me/lessons": () =>
        jsonResponse({
          completed: [
            "introducing-yourself",
            "pitching",
            "objection-handling",
            "probing-discovery",
            "referrals-networking",
            "next-steps",
            "asking-for-the-business",
            "interpersonal-skills",
          ],
        }),
    });
    expect(await within(await card("Next lesson")).findByText(/all eight/i)).toBeInTheDocument();
  });

  it("shows the practice quota and when the daily count resets, in local time", async () => {
    show();
    const quota = await card("Practice sessions");
    expect(await within(quota).findByText("2 of 5 today")).toBeInTheDocument();
    expect(within(quota).getByText("7 of 30 this month")).toBeInTheDocument();
    expect(within(quota).getByText(/today at 8:00 PM EDT/)).toBeInTheDocument();
  });

  it("lists the last three scorecards, skipping sessions that weren't scored", async () => {
    show({
      "GET /api/practice/attempts?page=1": () =>
        jsonResponse(
          pageOf([
            attempt({ id: "1".repeat(24), status: "active", overall: null }),
            attempt({ id: "2".repeat(24), skill: "objection-handling", overall: 84 }),
            attempt({ id: "3".repeat(24), status: "abandoned", overall: null }),
            attempt({ id: "4".repeat(24), skill: "next-steps", overall: 41 }),
            attempt({ id: "5".repeat(24), overall: 66 }),
            attempt({ id: "6".repeat(24), overall: 90 }),
          ]),
        ),
    });
    const recent = await card("Recent scorecards");
    const links = await within(recent).findAllByRole("link", { name: /scored/i });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      `/app/practice/attempt/${"2".repeat(24)}`,
      `/app/practice/attempt/${"4".repeat(24)}`,
      `/app/practice/attempt/${"5".repeat(24)}`,
    ]);
    expect(links[0]).toHaveAccessibleName(/objection handling.*scored 84/i);
  });

  it("gives each empty card a next step", async () => {
    show();
    expect(
      await within(await card("Recent scorecards")).findByRole("link", { name: /practice/i }),
    ).toHaveAttribute("href", "/app/practice");
    expect(
      await within(await card("Applications")).findByRole("link", { name: /browse jobs/i }),
    ).toHaveAttribute("href", "/app/jobs");
  });

  it("counts applications by status", async () => {
    show({
      "GET /api/me/applications?pageSize=50": () =>
        jsonResponse(
          pageOf([
            application({ id: "1".repeat(24) }),
            application({ id: "2".repeat(24) }),
            application({ id: "3".repeat(24), status: "interview" }),
          ]),
        ),
    });
    const apps = await card("Applications");
    expect(await within(apps).findByText("Applied")).toBeInTheDocument();
    const count = (label: string) => within(apps).getByText(label).parentElement?.textContent;
    expect(count("Applied")).toBe("Applied2");
    expect(count("Interview")).toBe("Interview1");
    expect(within(apps).queryByText("Hired")).not.toBeInTheDocument();
  });

  it("keeps the other cards when one request fails", async () => {
    show({
      "GET /api/practice/quota": () => errorResponse(500, "internal_error", "Something went wrong"),
    });
    expect(
      await within(await card("Practice sessions")).findByText(/couldn.t load/i),
    ).toBeVisible();
    expect(
      await within(await card("Next lesson")).findByRole("link", { name: /pitching/i }),
    ).toBeVisible();
  });
});
