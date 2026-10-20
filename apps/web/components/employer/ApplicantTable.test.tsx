import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { callsTo, jsonResponse, serveApi } from "@/lib/test-api";
import { pageOf } from "@/components/student/test-fixtures";
import { ApplicantTable } from "./ApplicantTable";
import { APPLICATION_ID, JOB_ID, applicant } from "./test-fixtures";

const LIST = `/api/employer/jobs/${JOB_ID}/applications`;

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup(initialId?: string) {
  const second = applicant({
    id: "b".repeat(24),
    status: "shortlisted",
    savedByEmployer: true,
    student: {
      firstName: "Sam",
      lastName: "Ortiz",
      school: "Harbor City College",
      major: "Communications",
      gradYear: 2026,
    },
  });
  const fetchMock = serveApi({
    [`GET ${LIST}?page=1`]: () => jsonResponse(pageOf([applicant(), second])),
    [`GET ${LIST}?page=1&status=shortlisted`]: () => jsonResponse(pageOf([second])),
    [`GET ${LIST}?page=1&saved=true`]: () => jsonResponse(pageOf([second])),
  });
  render(
    <ApplicantTable
      jobId={JOB_ID}
      jobTitle="Sales development representative"
      initialId={initialId}
    />,
  );
  return fetchMock;
}

describe("ApplicantTable", () => {
  it("lists applicants with their status", async () => {
    setup();
    const table = await screen.findByRole("table", { name: /Applicants/ });
    const riley = within(table)
      .getByRole("button", { name: /Riley Hartwell/ })
      .closest("tr") as HTMLElement;
    expect(riley).toHaveTextContent("Applied");
    expect(riley).toHaveTextContent("Lakeview State University");
  });

  it("filters by status and by saved", async () => {
    const fetchMock = setup();
    await screen.findByRole("table", { name: /Applicants/ });
    await userEvent.click(
      within(screen.getByRole("group", { name: "Status" })).getByRole("button", {
        name: "Shortlisted",
      }),
    );
    expect(await screen.findByRole("button", { name: /Sam Ortiz/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Riley Hartwell/ })).not.toBeInTheDocument();
    expect(callsTo(fetchMock, `GET ${LIST}?page=1&status=shortlisted`)).toBe(1);

    await userEvent.click(
      within(screen.getByRole("group", { name: "Status" })).getByRole("button", { name: "All" }),
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "Saved only" }));
    expect(await screen.findByRole("button", { name: /Sam Ortiz/ })).toBeVisible();
    expect(callsTo(fetchMock, `GET ${LIST}?page=1&saved=true`)).toBe(1);
  });

  it("opens an applicant's details", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: /Riley Hartwell/ }));
    expect(screen.getByRole("heading", { name: "Riley Hartwell", level: 2 })).toBeVisible();
  });

  it("opens the applicant named in the link", async () => {
    setup(APPLICATION_ID);
    expect(await screen.findByRole("heading", { name: "Riley Hartwell", level: 2 })).toBeVisible();
  });
});
