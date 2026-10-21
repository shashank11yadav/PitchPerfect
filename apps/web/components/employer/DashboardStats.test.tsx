import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, serveApi } from "@/lib/test-api";
import { DashboardStats } from "./DashboardStats";
import { APPLICATION_ID, JOB_ID, dashboard } from "./test-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup(data = dashboard()) {
  serveApi({ "GET /api/employer/dashboard": () => jsonResponse(data) });
  render(<DashboardStats />);
}

describe("DashboardStats", () => {
  it("shows the four counts with their names", async () => {
    setup();
    const counts = await screen.findByRole("list", { name: "Your jobs and applicants in numbers" });
    const expected: [string, string][] = [
      ["Active jobs", "2"],
      ["Drafts", "1"],
      ["Open applications", "3"],
      ["Upcoming interviews", "1"],
    ];
    for (const [label, value] of expected) {
      expect(within(counts).getByText(label).closest("li")).toHaveTextContent(value);
    }
  });

  it("lists recent applications with their job and a way to open them", async () => {
    setup();
    const link = await screen.findByRole("link", { name: /Riley Hartwell/ });
    expect(link).toHaveAttribute(
      "href",
      `/employer/jobs/${JOB_ID}/applicants?application=${APPLICATION_ID}`,
    );
    expect(link.closest("li")).toHaveTextContent("Sales development representative");
    expect(link.closest("li")).toHaveTextContent("Applied");
  });

  it("points a new employer at their first job", async () => {
    setup(
      dashboard({
        activeJobs: 0,
        drafts: 0,
        applicants: 0,
        interviewsUpcoming: 0,
        recentApplications: [],
      }),
    );
    expect(await screen.findByRole("heading", { name: "Post your first job" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Post a job" })).toHaveAttribute(
      "href",
      "/employer/jobs/new",
    );
  });

  it("says what happens next when jobs are live but nobody has applied", async () => {
    setup(dashboard({ applicants: 0, interviewsUpcoming: 0, recentApplications: [] }));
    expect(await screen.findByText(/No applications yet/)).toBeVisible();
  });
});
