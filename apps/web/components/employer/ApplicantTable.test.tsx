import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrf } from "@/lib/api";
import { callsTo, csrf, jsonResponse, serveApi } from "@/lib/test-api";
import { pageOf } from "@/components/student/test-fixtures";
import { ApplicantTable } from "./ApplicantTable";
import { APPLICATION_ID, JOB_ID, applicant } from "./test-fixtures";

const LIST = `/api/employer/jobs/${JOB_ID}/applications`;

beforeEach(() => {
  resetCsrf();
});

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

  it("calls a rejection “Not a fit” on the employer side", async () => {
    setup();
    const filters = within(screen.getByRole("group", { name: "Status" }));
    expect(filters.getByRole("button", { name: "Not a fit" })).toBeVisible();
    expect(filters.queryByRole("button", { name: "Not selected" })).not.toBeInTheDocument();
    await screen.findByRole("table", { name: /Applicants/ });
  });

  it("drops an applicant from a saved-only list once they're unsaved", async () => {
    const sam = applicant({
      id: "b".repeat(24),
      savedByEmployer: true,
      student: {
        firstName: "Sam",
        lastName: "Ortiz",
        school: "Harbor City College",
        major: "Communications",
        gradYear: 2026,
      },
    });
    let saved = true;
    const fetchMock = serveApi({
      "GET /api/auth/csrf": csrf,
      [`GET ${LIST}?page=1`]: () => jsonResponse(pageOf([sam])),
      [`GET ${LIST}?page=1&saved=true`]: () => jsonResponse(pageOf(saved ? [sam] : [])),
      [`DELETE /api/employer/applications/${"b".repeat(24)}/save`]: () => {
        saved = false;
        return new Response(null, { status: 204 });
      },
    });
    render(<ApplicantTable jobId={JOB_ID} jobTitle="Sales development representative" />);
    await screen.findByRole("table", { name: /Applicants/ });
    await userEvent.click(screen.getByRole("checkbox", { name: "Saved only" }));
    await userEvent.click(await screen.findByRole("button", { name: /Sam Ortiz/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("aria-pressed", "false");
    });
    await userEvent.click(screen.getByRole("button", { name: "Applicants" }));
    expect(await screen.findByText(/No applicants match these filters/)).toBeVisible();
    expect(callsTo(fetchMock, `GET ${LIST}?page=1&saved=true`)).toBe(2);
  });

  it("asks for the job's applicants with an encoded id", async () => {
    const fetchMock = serveApi({
      [`GET /api/employer/jobs/${encodeURIComponent("a/b?c")}/applications?page=1`]: () =>
        jsonResponse(pageOf([])),
    });
    render(<ApplicantTable jobId="a/b?c" jobTitle="Sales development representative" />);
    expect(await screen.findByText("No applicants yet")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
