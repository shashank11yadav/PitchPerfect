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
import { JobApplicants } from "./JobApplicants";
import { JobEditor } from "./JobEditor";
import { JOB_ID, company, employerJob } from "./test-fixtures";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const JOB = `/api/employer/jobs/${JOB_ID}`;
const STATUS = `POST ${JOB}/status`;

beforeEach(() => {
  resetCsrf();
  router.push.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup(job = employerJob(), routes: Record<string, Route> = {}) {
  const fetchMock = serveApi({
    "GET /api/auth/csrf": csrf,
    [`GET ${JOB}`]: () => jsonResponse({ job }),
    "GET /api/employer/company": () => jsonResponse({ company: company() }),
    [STATUS]: (init) => jsonResponse({ job: { ...job, ...(bodyOf(init) as object) } }),
    [`PATCH ${JOB}`]: (init) => jsonResponse({ job: { ...job, ...(bodyOf(init) as object) } }),
    [`DELETE ${JOB}`]: () => new Response(null, { status: 204 }),
    ...routes,
  });
  render(<JobEditor id={JOB_ID} />);
  return fetchMock;
}

describe("JobEditor", () => {
  it("warns that archiving closes open applications and emails those applicants", async () => {
    const fetchMock = setup(employerJob({ status: "active", applicantCount: 4 }));
    await userEvent.click(await screen.findByRole("button", { name: "Archive" }));
    const dialog = screen.getByRole("dialog", { name: "Archive this job?" });
    expect(dialog).toHaveTextContent(
      "It comes off the job board. Every open application is closed, and each of those applicants gets an email saying applications have closed.",
    );
    expect(dialog).toHaveTextContent(/Reactivating it later won’t reopen them/);
    expect(callsTo(fetchMock, STATUS)).toBe(0);
    await userEvent.click(within(dialog).getByRole("button", { name: "Archive job" }));
    await waitFor(() => {
      expect(screen.getByText("Archived")).toBeVisible();
    });
    expect(lastBody(fetchMock, STATUS)).toEqual({ status: "archived" });
  });

  it("explains why a job with applicants can't be deleted", async () => {
    setup(employerJob({ status: "active", applicantCount: 4 }));
    await screen.findByRole("button", { name: "Archive" });
    expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
    expect(screen.getByText(/can’t be deleted once someone has applied/)).toBeVisible();
  });

  it("deletes a draft after asking, then goes back to the jobs list", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "Delete draft" }));
    const dialog = screen.getByRole("dialog", { name: "Delete this draft?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete draft" }));
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/employer/jobs");
    });
  });

  it("reactivates an archived job", async () => {
    const fetchMock = setup(
      employerJob({
        status: "archived",
        applicantCount: 2,
        publishedAt: "2026-10-01T00:00:00.000Z",
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Reactivate" }));
    await waitFor(() => {
      expect(callsTo(fetchMock, STATUS)).toBe(1);
    });
    expect(lastBody(fetchMock, STATUS)).toEqual({ status: "active" });
  });

  it("publishes a draft by saving the form and then changing its status", async () => {
    const fetchMock = setup();
    await screen.findByRole("textbox", { name: /Job description/ });
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => {
      expect(callsTo(fetchMock, STATUS)).toBe(1);
    });
    expect(callsTo(fetchMock, `PATCH ${JOB}`)).toBe(1);
    const order = fetchMock.mock.calls
      .map(([url, init]) => `${init?.method ?? "GET"} ${url as string}`)
      .filter((key) => key === `PATCH ${JOB}` || key === STATUS);
    expect(order).toEqual([`PATCH ${JOB}`, STATUS]);
    expect(await screen.findByText(/It’s on the job board now/)).toBeVisible();
  });

  it("previews the saved listing through the shared job view", async () => {
    setup();
    await userEvent.click(await screen.findByRole("tab", { name: "Preview" }));
    const preview = screen.getByRole("tabpanel", { name: "Preview" });
    expect(within(preview).getByRole("heading", { name: employerJob().title })).toBeInTheDocument();
    expect(within(preview).getByText("Book demos")).toBeInTheDocument();
    expect(
      within(preview).getByRole("heading", { name: "About Pitchwell Demo Hiring Co" }),
    ).toBeInTheDocument();
  });

  it("encodes the id in every request and treats an unknown job as not found", async () => {
    const odd = "a/b?c";
    const fetchMock = serveApi({
      [`GET /api/employer/jobs/${encodeURIComponent(odd)}`]: () =>
        errorResponse(404, "not_found", "Not found"),
      "GET /api/employer/company": () => jsonResponse({ company: company() }),
    });
    render(<JobEditor id={odd} />);
    expect(await screen.findByRole("heading", { name: "This job isn’t here" })).toBeVisible();
    expect(callsTo(fetchMock, `GET /api/employer/jobs/${encodeURIComponent(odd)}`)).toBe(1);
  });

  it("marks deleting as destructive", async () => {
    setup();
    expect(await screen.findByRole("button", { name: "Delete draft" })).toHaveClass("text-danger");
    expect(screen.getByRole("button", { name: "Delete draft" })).not.toHaveClass("text-primary");
  });
});

describe("JobApplicants", () => {
  it("encodes the job id it asks for", async () => {
    const fetchMock = serveApi({
      [`GET /api/employer/jobs/${encodeURIComponent("a/b")}`]: () =>
        errorResponse(404, "not_found", "Not found"),
    });
    render(<JobApplicants id="a/b" />);
    expect(await screen.findByRole("heading", { name: "This job isn’t here" })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
