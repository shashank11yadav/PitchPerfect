import { LIMITS } from "@pitchperfect/shared";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrf } from "@/lib/api";
import { callsTo, csrf, errorResponse, jsonResponse, serveApi, type Route } from "@/lib/test-api";
import { ResumeUpload } from "./ResumeUpload";
import { renderSignedIn, studentMe } from "./test-fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

// The input's `accept` is a hint to the file picker; these tests check what happens past it.
const user = () => userEvent.setup({ applyAccept: false });

const pdf = (bytes = 2048, name = "resume.pdf") =>
  new File([new Uint8Array(bytes)], name, { type: "application/pdf" });

const uploaded: Route = () =>
  jsonResponse({ resume: { uploadedAt: "2026-10-20T14:00:00.000Z", sizeBytes: 2048 } });

function setup(routes: Record<string, Route> = {}, { hasResume = false } = {}) {
  const fetchMock = serveApi({
    "GET /api/auth/me": () => jsonResponse(studentMe({ hasResume })),
    "GET /api/auth/csrf": csrf,
    ...routes,
  });
  renderSignedIn(<ResumeUpload />);
  return fetchMock;
}

beforeEach(() => {
  resetCsrf();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ResumeUpload", () => {
  it("rejects a file that isn't a PDF before sending it, with an error on the field", async () => {
    const fetchMock = setup();
    const input = await screen.findByLabelText("Upload a PDF");
    await user().upload(input, new File(["hello"], "resume.docx", { type: "application/msword" }));

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/only PDF files/i);
    expect(callsTo(fetchMock, "PUT /api/me/resume")).toBe(0);
  });

  it("rejects a PDF over the size limit before sending it", async () => {
    const fetchMock = setup();
    const input = await screen.findByLabelText("Upload a PDF");
    await user().upload(input, pdf(LIMITS.resumeMaxBytes + 1));

    expect(input).toHaveAccessibleDescription(/2 MB/);
    expect(callsTo(fetchMock, "PUT /api/me/resume")).toBe(0);
  });

  it("shows the server's message when the file is too large", async () => {
    setup({
      "PUT /api/me/resume": () => errorResponse(413, "file_too_large", "Résumés can be up to 2 MB"),
    });
    const input = await screen.findByLabelText("Upload a PDF");
    await user().upload(input, pdf());

    await waitFor(() => {
      expect(input).toHaveAccessibleDescription(
        /That file is over 2 MB\. Save a smaller PDF and try again\./,
      );
    });
  });

  it("shows the server's message when the content isn't really a PDF", async () => {
    setup({
      "PUT /api/me/resume": () => errorResponse(415, "unsupported_file", "Upload a PDF file"),
    });
    const input = await screen.findByLabelText("Upload a PDF");
    await user().upload(input, pdf(16, "renamed.pdf"));

    await waitFor(() => {
      expect(input).toHaveAccessibleDescription(/Upload a PDF file\./);
    });
  });

  it("uploads one file as multipart and then offers download and delete", async () => {
    let body: unknown;
    setup({
      "PUT /api/me/resume": (init) => {
        body = init?.body;
        return uploaded(init);
      },
    });
    await user().upload(await screen.findByLabelText("Upload a PDF"), pdf());

    expect(await screen.findByRole("status")).toHaveTextContent(/uploaded/i);
    expect(body).toBeInstanceOf(FormData);
    expect([...(body as FormData).keys()]).toEqual(["file"]);
    expect(screen.getByRole("link", { name: /download/i })).toHaveAttribute(
      "href",
      "/api/me/resume",
    );
    expect(screen.getByRole("button", { name: "Delete résumé" })).toBeInTheDocument();
  });

  it("re-reads the account when the upload's answer can't be read, instead of guessing", async () => {
    let stored = false;
    const fetchMock = serveApi({
      "GET /api/auth/me": () => jsonResponse(studentMe({ hasResume: stored })),
      "GET /api/auth/csrf": csrf,
      "PUT /api/me/resume": () => {
        stored = true;
        return jsonResponse({ ok: true });
      },
    });
    renderSignedIn(<ResumeUpload />);
    const input = await screen.findByLabelText("Upload a PDF");
    await user().upload(input, pdf());
    await waitFor(() => {
      expect(input).toHaveAccessibleDescription(/couldn.t confirm/i);
    });
    // The server kept the file, and the page now says so.
    expect(await screen.findByRole("link", { name: /download/i })).toBeInTheDocument();
    expect(callsTo(fetchMock, "GET /api/auth/me")).toBeGreaterThan(1);
  });

  it("deletes the résumé after confirming", async () => {
    const fetchMock = setup(
      { "DELETE /api/me/resume": () => new Response(null, { status: 204 }) },
      { hasResume: true },
    );
    await user().click(await screen.findByRole("button", { name: "Delete résumé" }));
    expect(callsTo(fetchMock, "DELETE /api/me/resume")).toBe(0);
    await user().click(await screen.findByRole("button", { name: "Delete it" }));

    await waitFor(() => {
      expect(callsTo(fetchMock, "DELETE /api/me/resume")).toBe(1);
    });
    expect(await screen.findByText(/no résumé on file/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /download/i })).not.toBeInTheDocument();
  });
});
