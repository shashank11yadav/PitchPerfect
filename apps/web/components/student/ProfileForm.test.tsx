import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrf } from "@/lib/api";
import { bodyOf, callsTo, csrf, jsonResponse, meBody, serveApi } from "@/lib/test-api";
import { ProfileForm } from "./ProfileForm";
import { renderSignedIn, studentMe } from "./test-fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

beforeEach(() => {
  resetCsrf();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProfileForm", () => {
  it("fills the student's fields from the session and saves changes", async () => {
    let sent: unknown;
    const fetchMock = serveApi({
      "GET /api/auth/me": () => jsonResponse(studentMe()),
      "GET /api/auth/csrf": csrf,
      "PATCH /api/me/profile": (init) => {
        sent = bodyOf(init);
        return jsonResponse(studentMe());
      },
    });
    renderSignedIn(<ProfileForm role="student" />);

    const school = await screen.findByLabelText(/school/i);
    expect(school).toHaveValue("Lakeside College");
    expect(screen.getByLabelText(/graduation year/i)).toHaveValue("2027");
    expect(screen.getByLabelText(/state/i)).toHaveValue("MA");

    await userEvent.clear(school);
    await userEvent.type(school, "Hillcrest University");
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/saved/i);
    expect(sent).toEqual({
      firstName: "Riley",
      lastName: "Hart",
      school: "Hillcrest University",
      major: "Business",
      gradYear: 2027,
      targetRole: "Sales development representative",
      industry: "Software",
      state: "MA",
    });
    await waitFor(() => {
      expect(callsTo(fetchMock, "GET /api/auth/me")).toBe(2);
    });
  });

  it("won't save a field left empty", async () => {
    const fetchMock = serveApi({ "GET /api/auth/me": () => jsonResponse(studentMe()) });
    renderSignedIn(<ProfileForm role="student" />);
    await userEvent.clear(await screen.findByLabelText(/major/i));
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(screen.getByLabelText(/major/i)).toHaveAttribute("aria-invalid", "true");
    expect(callsTo(fetchMock, "PATCH /api/me/profile")).toBe(0);
  });

  it("shows only the employer's fields for an employer", async () => {
    serveApi({
      "GET /api/auth/me": () =>
        jsonResponse({
          ...meBody("employer"),
          profile: { jobTitle: "Sales manager", companyId: "65f1c0ffee0000000000c0de" },
        }),
    });
    renderSignedIn(<ProfileForm role="employer" />);
    expect(await screen.findByLabelText(/job title/i)).toHaveValue("Sales manager");
    expect(screen.queryByLabelText(/school/i)).not.toBeInTheDocument();
  });
});
