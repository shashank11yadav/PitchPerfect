import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrf } from "@/lib/api";
import { SessionProvider } from "@/lib/session";
import { ApplyActions } from "./ApplyActions";
import { jobSummary, json } from "./test-fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const JOB_ID = "65f1c0ffee0000000000abcd";
const SLUG = "sales-development-representative-a1b2c3";

type Route = (init: RequestInit | undefined) => Response;
const fetchMock = vi.fn<typeof fetch>();

/** Answers `"METHOD /path"` keys; anything else is a test failure. */
function serve(routes: Record<string, Route>) {
  fetchMock.mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    const key = `${init?.method ?? "GET"} ${url}`;
    const route = routes[key];
    if (!route) return Promise.reject(new Error(`unexpected request ${key}`));
    return Promise.resolve(route(init));
  });
}

const user = (role: "student" | "employer") => ({
  user: {
    id: "65f1c0ffee0000000000f00d",
    email: `${role}@example.test`,
    role,
    firstName: "Riley",
    lastName: "Hart",
    emailVerifiedAt: "2026-10-01T00:00:00.000Z",
    practiceConsentAt: null,
  },
  profile: {},
});

const savedPage = (ids: string[]) => ({
  items: ids.map((id) => jobSummary({ id })),
  page: 1,
  pageSize: 50,
  total: ids.length,
});

const error = (status: number, code: string, message: string) =>
  json({ error: { code, message, requestId: "r1" } }, status);

const student = (extra: Record<string, Route> = {}, saved: string[] = []) => ({
  "GET /api/auth/me": () => json(user("student")),
  "GET /api/me/saved-jobs?pageSize=50": () => json(savedPage(saved)),
  "GET /api/me/applications?pageSize=50": () => json(savedPage([])),
  "GET /api/auth/csrf": () => json({ csrfToken: "token-1" }),
  ...extra,
});

const renderActions = () =>
  render(
    <SessionProvider initialStatus="loading">
      <ApplyActions jobId={JOB_ID} slug={SLUG} />
    </SessionProvider>,
  );

beforeEach(() => {
  resetCsrf();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("ApplyActions", () => {
  it("sends a signed-out visitor to sign in and back to this job", async () => {
    serve({ "GET /api/auth/me": () => error(401, "unauthorized", "Sign in first") });
    renderActions();
    const link = await screen.findByRole("link", { name: "Sign in to apply" });
    const href = new URL(link.getAttribute("href") ?? "", "http://web.test");
    expect(href.pathname).toBe("/signin");
    expect(href.searchParams.get("next")).toBe(`/jobs/${SLUG}`);
    expect(screen.queryByRole("button", { name: /apply/i })).not.toBeInTheDocument();
  });

  it("lets a student apply, then says where to follow it up", async () => {
    let body: unknown;
    serve(
      student({
        [`POST /api/jobs/${JOB_ID}/apply`]: (init) => {
          body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
          expect(new Headers(init?.headers).get("x-csrf-token")).toBe("token-1");
          return json({ application: { id: "a1" } }, 201);
        },
      }),
    );
    renderActions();
    await userEvent.click(await screen.findByRole("button", { name: "Apply" }));
    expect(await screen.findByText(/application is in/i)).toBeInTheDocument();
    expect(body).toEqual({});
    expect(screen.getByRole("link", { name: /your applications/i })).toHaveAttribute(
      "href",
      "/app/applications",
    );
    expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
  });

  it("tells a student who already applied, instead of failing", async () => {
    serve(
      student({
        [`POST /api/jobs/${JOB_ID}/apply`]: () =>
          error(409, "already_applied", "You've already applied"),
      }),
    );
    renderActions();
    await userEvent.click(await screen.findByRole("button", { name: "Apply" }));
    expect(await screen.findByText(/already applied to this job/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /your applications/i })).toBeInTheDocument();
  });

  it("asks a student with an unverified email to verify it first", async () => {
    serve(
      student({
        [`POST /api/jobs/${JOB_ID}/apply`]: () =>
          error(403, "email_not_verified", "Verify your email to continue"),
      }),
    );
    renderActions();
    await userEvent.click(await screen.findByRole("button", { name: "Apply" }));
    expect(await screen.findByText(/verify your email before you apply/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
  });

  it("shows the api's message for any other failure", async () => {
    serve(
      student({
        [`POST /api/jobs/${JOB_ID}/apply`]: () =>
          error(404, "not_found", "This job is no longer listed"),
      }),
    );
    renderActions();
    await userEvent.click(await screen.findByRole("button", { name: "Apply" }));
    expect(await screen.findByText("This job is no longer listed")).toBeInTheDocument();
  });

  it("saves and unsaves the job for a student, and says so", async () => {
    const calls: string[] = [];
    const noContent = (method: string) => () => {
      calls.push(method);
      return new Response(null, { status: 204 });
    };
    serve(
      student({
        [`PUT /api/jobs/${JOB_ID}/save`]: noContent("PUT"),
        [`DELETE /api/jobs/${JOB_ID}/save`]: noContent("DELETE"),
      }),
    );
    renderActions();
    const save = await screen.findByRole("button", { name: "Save job" });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
    await userEvent.click(save);
    await userEvent.click(await screen.findByRole("button", { name: "Saved" }));
    expect(await screen.findByRole("button", { name: "Save job" })).toBeInTheDocument();
    expect(screen.getByText("Removed from your saved jobs.")).toBeInTheDocument();
    expect(calls).toEqual(["PUT", "DELETE"]);
  });

  it("starts as saved when the job is already in the student's saved list", async () => {
    serve(student({}, [JOB_ID]));
    renderActions();
    expect(await screen.findByRole("button", { name: "Saved" })).toBeInTheDocument();
  });

  it("knows on load when the student has already applied", async () => {
    serve(
      student({
        "GET /api/me/applications?pageSize=50": () =>
          json({ items: [{ id: "a1", job: { id: JOB_ID } }], page: 1, pageSize: 50, total: 1 }),
      }),
    );
    renderActions();
    expect(await screen.findByText(/already applied to this job/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save job" })).toBeInTheDocument();
  });

  it("shows an employer a note instead of apply actions", async () => {
    serve({ "GET /api/auth/me": () => json(user("employer")) });
    renderActions();
    expect(await screen.findByText(/signed in as an employer/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in to apply" })).not.toBeInTheDocument();
  });
});
