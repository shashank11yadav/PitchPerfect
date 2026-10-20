import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrf } from "@/lib/api";
import { callsTo, csrf, jsonResponse, lastBody, serveApi } from "@/lib/test-api";
import { NewJob } from "./NewJob";
import { JOB_ID, employerJob } from "./test-fixtures";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// jsdom can't place a cursor in a contenteditable (no elementFromPoint); RichTextEditor has its
// own tests, so here a plain textarea stands in for it.
vi.mock("./RichTextEditor", () => ({
  RichTextEditor: ({ label, onChange }: { label: string; onChange: (html: string) => void }) => (
    <textarea
      aria-label={label}
      onChange={(event) => {
        onChange(`<p>${event.target.value}</p>`);
      }}
    />
  ),
}));

beforeEach(() => {
  resetCsrf();
  router.push.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function fillIn() {
  await screen.findByRole("textbox", { name: /Job description/ });
  await userEvent.type(screen.getByLabelText(/^Job title/), "Account executive");
  await userEvent.type(screen.getByLabelText(/^Location/), "Boston, MA");
  await userEvent.selectOptions(screen.getByLabelText(/^Workplace/), "hybrid");
  await userEvent.selectOptions(screen.getByLabelText(/^Job type/), "full_time");
  await userEvent.type(screen.getByLabelText(/Lowest/), "50000");
  await userEvent.type(screen.getByLabelText(/Highest/), "60000");
  await userEvent.type(
    screen.getByRole("textbox", { name: /Job description/ }),
    "Run first calls.",
  );
}

describe("NewJob", () => {
  it("publishes a new job in one request and opens it", async () => {
    const fetchMock = serveApi({
      "GET /api/auth/csrf": csrf,
      "POST /api/employer/jobs": () =>
        jsonResponse({ job: employerJob({ status: "active" }) }, 201),
    });
    render(<NewJob />);
    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith(`/employer/jobs/${JOB_ID}?created=published`);
    });
    expect(lastBody(fetchMock, "POST /api/employer/jobs")).toMatchObject({
      title: "Account executive",
      status: "active",
      descriptionHtml: "<p>Run first calls.</p>",
    });
    expect(callsTo(fetchMock, "POST /api/employer/jobs")).toBe(1);
  });

  it("saves a draft without a status, which the api reads as draft", async () => {
    const fetchMock = serveApi({
      "GET /api/auth/csrf": csrf,
      "POST /api/employer/jobs": () => jsonResponse({ job: employerJob() }, 201),
    });
    render(<NewJob />);
    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith(`/employer/jobs/${JOB_ID}?created=draft`);
    });
    expect(lastBody(fetchMock, "POST /api/employer/jobs")).not.toHaveProperty("status");
  });
});
