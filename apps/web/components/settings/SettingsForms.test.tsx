import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrf } from "@/lib/api";
import {
  bodyOf,
  callsTo,
  csrf,
  errorResponse,
  jsonResponse,
  serveApi,
  type Route,
} from "@/lib/test-api";
import { renderSignedIn, studentMe } from "@/components/student/test-fixtures";
import { ChangeEmailForm } from "./ChangeEmailForm";
import { ChangePasswordForm } from "./ChangePasswordForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const resetSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    resetCsrf: () => {
      resetSpy();
      actual.resetCsrf();
    },
  };
});

function setup(routes: Record<string, Route>) {
  return serveApi({
    "GET /api/auth/me": () => jsonResponse(studentMe()),
    "GET /api/auth/csrf": csrf,
    ...routes,
  });
}

beforeEach(() => {
  resetCsrf();
  resetSpy.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChangePasswordForm", () => {
  it("checks the new password on the client first", async () => {
    const fetchMock = setup({});
    renderSignedIn(<ChangePasswordForm />);
    await userEvent.type(await screen.findByLabelText(/current password/i), "the old passphrase");
    await userEvent.type(screen.getByLabelText(/^new password/i), "short");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByLabelText(/^new password/i)).toHaveAccessibleDescription(/12 characters/);
    expect(callsTo(fetchMock, "POST /api/me/change-password")).toBe(0);
  });

  it("changes it, then picks up the rotated session and clears the form", async () => {
    let sent: unknown;
    const fetchMock = setup({
      "POST /api/me/change-password": (init) => {
        sent = bodyOf(init);
        return jsonResponse({ ok: true });
      },
    });
    renderSignedIn(<ChangePasswordForm />);
    await userEvent.type(await screen.findByLabelText(/current password/i), "the old passphrase");
    await userEvent.type(screen.getByLabelText(/^new password/i), "a brand new passphrase");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/password is changed/i);
    expect(sent).toEqual({
      currentPassword: "the old passphrase",
      newPassword: "a brand new passphrase",
    });
    expect(resetSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(callsTo(fetchMock, "GET /api/auth/me")).toBe(2);
    });
    expect(screen.getByLabelText(/current password/i)).toHaveValue("");
  });

  it("explains a wrong current password without marking the new one", async () => {
    setup({
      "POST /api/me/change-password": () =>
        errorResponse(401, "invalid_credentials", "Email or password is incorrect"),
    });
    renderSignedIn(<ChangePasswordForm />);
    await userEvent.type(await screen.findByLabelText(/current password/i), "not it at all");
    await userEvent.type(screen.getByLabelText(/^new password/i), "a brand new passphrase");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/current password isn.t right/i);
    expect(screen.getByLabelText(/^new password/i)).not.toHaveAttribute("aria-invalid");
  });

  it("puts the server's password policy message on the new password", async () => {
    setup({
      "POST /api/me/change-password": () =>
        errorResponse(400, "validation_failed", "Some fields need attention", {
          fields: { newPassword: "This password has appeared in a data breach" },
        }),
    });
    renderSignedIn(<ChangePasswordForm />);
    await userEvent.type(await screen.findByLabelText(/current password/i), "the old passphrase");
    await userEvent.type(screen.getByLabelText(/^new password/i), "password1234567");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() => {
      expect(screen.getByLabelText(/^new password/i)).toHaveAccessibleDescription(/data breach/);
    });
  });
});

describe("ChangeEmailForm", () => {
  it("sends the new address with the password, then refreshes the rotated session", async () => {
    let sent: unknown;
    const fetchMock = setup({
      "POST /api/me/change-email": (init) => {
        sent = bodyOf(init);
        return jsonResponse({ ok: true });
      },
    });
    renderSignedIn(<ChangeEmailForm />);
    expect(await screen.findByText("student@example.test")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/new email/i), "Riley.Hart@Example.test");
    await userEvent.type(screen.getByLabelText(/current password/i), "the old passphrase");
    await userEvent.click(screen.getByRole("button", { name: "Change email" }));

    expect(await screen.findByRole("status")).toHaveTextContent("riley.hart@example.test");
    expect(sent).toEqual({
      newEmail: "riley.hart@example.test",
      currentPassword: "the old passphrase",
    });
    expect(resetSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(callsTo(fetchMock, "GET /api/auth/me")).toBe(2);
    });
  });

  it("answers the same way whether or not the new address is free", async () => {
    setup({ "POST /api/me/change-email": () => jsonResponse({ ok: true }) });
    renderSignedIn(<ChangeEmailForm />);
    await userEvent.type(await screen.findByLabelText(/new email/i), "taken@example.test");
    await userEvent.type(screen.getByLabelText(/current password/i), "the old passphrase");
    await userEvent.click(screen.getByRole("button", { name: "Change email" }));
    expect(
      await screen.findByText(/If taken@example.test can be used, we sent it a link/),
    ).toBeVisible();
  });
});
