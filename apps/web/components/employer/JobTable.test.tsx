import type { EmployerJobSummary, JobStatus } from "@pitchperfect/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, serveApi } from "@/lib/test-api";
import { pageOf } from "@/components/student/test-fixtures";
import { JobTable } from "./JobTable";
import { employerJob } from "./test-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

const summary = (overrides: Partial<EmployerJobSummary>): EmployerJobSummary => {
  const job = employerJob();
  return {
    id: job.id,
    slug: job.slug,
    title: job.title,
    location: job.location,
    workplace: job.workplace,
    employmentType: job.employmentType,
    status: job.status,
    publishedAt: job.publishedAt,
    createdAt: job.createdAt,
    applicantCount: job.applicantCount,
    ...overrides,
  };
};

function setup(
  counts: Record<JobStatus, number>,
  lists: Partial<Record<JobStatus, EmployerJobSummary[]>> = {},
) {
  const routes = Object.fromEntries(
    (["draft", "active", "archived"] as const).flatMap((status) => [
      [
        `GET /api/employer/jobs?status=${status}&pageSize=1`,
        () => jsonResponse(pageOf([], counts[status], 1)),
      ],
      [
        `GET /api/employer/jobs?status=${status}&page=1`,
        () => jsonResponse(pageOf(lists[status] ?? [], counts[status])),
      ],
    ]),
  );
  serveApi(routes);
  render(<JobTable />);
}

describe("JobTable", () => {
  it("counts each status on its tab and opens on the active jobs", async () => {
    setup(
      { draft: 1, active: 2, archived: 0 },
      {
        active: [
          summary({
            id: "a".repeat(24),
            status: "active",
            applicantCount: 3,
            title: "Sales development representative",
          }),
          summary({
            id: "b".repeat(24),
            status: "active",
            applicantCount: 0,
            title: "Sales operations intern",
          }),
        ],
        draft: [summary({ id: "c".repeat(24), title: "Account executive" })],
      },
    );
    const tabs = screen.getByRole("group", { name: "Job status" });
    expect(await within(tabs).findByRole("button", { name: "Active 2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(tabs).getByRole("button", { name: "Drafts 1" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(tabs).getByRole("button", { name: "Archived 0" })).toBeVisible();

    const table = await screen.findByRole("table");
    expect(
      within(table).getByRole("link", { name: "Sales development representative" }),
    ).toHaveAttribute("href", `/employer/jobs/${"a".repeat(24)}`);
    expect(within(table).getByRole("link", { name: /3 applicants/ })).toHaveAttribute(
      "href",
      `/employer/jobs/${"a".repeat(24)}/applicants`,
    );

    await userEvent.click(within(tabs).getByRole("button", { name: "Drafts 1" }));
    expect(await screen.findByRole("link", { name: "Account executive" })).toBeVisible();
  });

  it("starts someone with no jobs at posting their first", async () => {
    setup({ draft: 0, active: 0, archived: 0 });
    expect(await screen.findByRole("heading", { name: "Post your first job" })).toBeVisible();
    expect(screen.getAllByRole("link", { name: /Post a job/ })[0]).toHaveAttribute(
      "href",
      "/employer/jobs/new",
    );
  });
});
