import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrf } from "@/lib/api";
import { bodyOf, csrf, errorResponse, jsonResponse, serveApi } from "@/lib/test-api";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { ResetPasswordForm } from "./ResetPasswordForm";

const TOKEN = "b".repeat(43);

beforeEach(() => {
  resetCsrf();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("ForgotPasswordForm", () => {
  it("validates the email before sending", async () => {
    const fetchMock = serveApi({});
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(screen.getByLabelText(/email/i)).toHaveAccessibleDescription(/valid email/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("always shows the same confirmation", async () => {
    let sent: unknown;
    serveApi({
      "GET /api/auth/csrf": csrf,
      "POST /api/auth/forgot-password": (init) => {
        sent = bodyOf(init);
        return jsonResponse({ ok: true });
      },
    });
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "sam@example.test");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("heading", { name: "Check your inbox" })).toHaveFocus();
    expect(screen.getByText(/if there's an account for/i)).toHaveTextContent("sam@example.test");
    expect(screen.getByText(/30 minutes/)).toBeInTheDocument();
    expect(sent).toEqual({ email: "sam@example.test" });
  });
});

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", `/reset-password?token=${TOKEN}`);
  });

  async function submit(password: string) {
    await userEvent.type(screen.getByLabelText(/new password/i), password);
    await userEvent.click(screen.getByRole("button", { name: "Save new password" }));
  }

  it("removes the token from the address bar on load", () => {
    serveApi({});
    render(<ResetPasswordForm token={TOKEN} />);
    expect(window.location.search).toBe("");
    expect(window.location.href).not.toContain(TOKEN);
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
  });

  it("checks the length on the client with the shared schema", async () => {
    const fetchMock = serveApi({});
    render(<ResetPasswordForm token={TOKEN} />);
    await submit("too short");
    expect(screen.getByLabelText(/new password/i)).toHaveAccessibleDescription(
      /use at least 12 characters/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the token with the new password and links to sign in", async () => {
    let sent: unknown;
    serveApi({
      "GET /api/auth/csrf": csrf,
      "POST /api/auth/reset-password": (init) => {
        sent = bodyOf(init);
        return jsonResponse({ ok: true });
      },
    });
    render(<ResetPasswordForm token={TOKEN} />);
    await submit("a much longer passphrase");
    expect(await screen.findByRole("heading", { name: "Your password is changed" })).toHaveFocus();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/signin");
    expect(sent).toEqual({ token: TOKEN, password: "a much longer passphrase" });
  });

  it("shows the server's password policy error on the field", async () => {
    serveApi({
      "GET /api/auth/csrf": csrf,
      "POST /api/auth/reset-password": () =>
        errorResponse(400, "validation_failed", "Some fields need attention", {
          fields: { password: "This password has appeared in a data breach. Choose another." },
        }),
    });
    render(<ResetPasswordForm token={TOKEN} />);
    await submit("password1234");
    expect(await screen.findByText(/appeared in a data breach/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/new password/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("explains an invalid token and links to ask for a new one", async () => {
    serveApi({
      "GET /api/auth/csrf": csrf,
      "POST /api/auth/reset-password": () =>
        errorResponse(400, "invalid_token", "This link is invalid or has expired"),
    });
    render(<ResetPasswordForm token={TOKEN} />);
    await submit("a much longer passphrase");
    expect(
      await screen.findByRole("heading", { name: "This link has expired or was already used" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ask for a new link" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("treats a malformed token (validation_failed on token) like an expired one", async () => {
    serveApi({
      "GET /api/auth/csrf": csrf,
      "POST /api/auth/reset-password": () =>
        errorResponse(400, "validation_failed", "Some fields need attention", {
          fields: { token: "Too long" },
        }),
    });
    render(<ResetPasswordForm token={TOKEN} />);
    await submit("a much longer passphrase");
    expect(
      await screen.findByRole("heading", { name: "This link has expired or was already used" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("goes straight to the invalid state when the link has no token", () => {
    window.history.replaceState(null, "", "/reset-password");
    serveApi({});
    render(<ResetPasswordForm token={undefined} />);
    expect(
      screen.getByRole("heading", { name: "This link has expired or was already used" }),
    ).toBeInTheDocument();
  });
});
