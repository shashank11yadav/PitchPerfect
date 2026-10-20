import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrf } from "@/lib/api";
import { SessionProvider } from "@/lib/session";
import {
  bodyOf,
  callsTo,
  csrf,
  errorResponse,
  jsonResponse,
  meBody,
  serveApi,
} from "@/lib/test-api";
import { SigninForm } from "./SigninForm";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/signin" }));

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

const renderForm = (next?: string) =>
  render(
    <SessionProvider initialStatus="signed_out">
      <SigninForm next={next} />
    </SessionProvider>,
  );

async function fillAndSubmit(email = "riley@example.test", password = "correct horse battery") {
  await userEvent.type(screen.getByLabelText(/email/i), email);
  await userEvent.type(screen.getByLabelText(/^password/i), password);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

const signinAs = (role: "student" | "employer") => ({
  "GET /api/auth/csrf": csrf,
  "POST /api/auth/signin": () => jsonResponse({ user: meBody(role).user }),
  "GET /api/auth/me": () => jsonResponse(meBody(role)),
});

beforeEach(() => {
  resetCsrf();
  resetSpy.mockReset();
  router.push.mockReset();
  router.replace.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SigninForm", () => {
  it("shows labelled errors when submitted empty, without calling the api", async () => {
    const fetchMock = serveApi({});
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const email = screen.getByLabelText(/email/i);
    const password = screen.getByLabelText(/^password/i);
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription("Enter your email address");
    expect(password).toHaveAccessibleDescription(/enter your password/i);
    expect(email).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says the credentials don't match without blaming either field", async () => {
    serveApi({
      "GET /api/auth/csrf": csrf,
      "POST /api/auth/signin": () =>
        errorResponse(401, "invalid_credentials", "Email or password is incorrect"),
    });
    renderForm();
    await fillAndSubmit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That email and password don't match an account.");
    expect(alert.textContent).not.toMatch(/no account|unknown|wrong password|not found/i);
    expect(screen.getByLabelText(/email/i)).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText(/^password/i)).not.toHaveAttribute("aria-invalid");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it.each([
    ["120", "Too many attempts. Try again in 2 minutes."],
    ["30", "Too many attempts. Try again in 1 minute."],
  ])("turns a 429 with Retry-After %s into a wait time", async (retryAfter, message) => {
    serveApi({
      "GET /api/auth/csrf": csrf,
      "POST /api/auth/signin": () =>
        errorResponse(429, "rate_limited", "Too many requests", {
          headers: { "retry-after": retryAfter },
        }),
    });
    renderForm();
    await fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("signs in, drops the old CSRF token, refreshes the session, and goes to next", async () => {
    let sent: unknown;
    const fetchMock = serveApi({
      ...signinAs("student"),
      "POST /api/auth/signin": (init) => {
        sent = bodyOf(init);
        return jsonResponse({ user: meBody("student").user });
      },
    });
    renderForm("/jobs/sales-development-representative-a1b2c3");
    await fillAndSubmit(" Riley@Example.test ");

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/jobs/sales-development-representative-a1b2c3");
    });
    expect(sent).toEqual({ email: "riley@example.test", password: "correct horse battery" });
    expect(callsTo(fetchMock, "GET /api/auth/me")).toBe(1);
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  it("ignores next=//evil.test and goes to the role home", async () => {
    serveApi(signinAs("student"));
    renderForm("//evil.test");
    await fillAndSubmit();
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/app");
    });
  });

  it("sends an employer without next to the employer dashboard", async () => {
    serveApi(signinAs("employer"));
    renderForm();
    await fillAndSubmit();
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/employer");
    });
  });

  it("links to the forgot-password page", () => {
    serveApi({});
    renderForm();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });
});
