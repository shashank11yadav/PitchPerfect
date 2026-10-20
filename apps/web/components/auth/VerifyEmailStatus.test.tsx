import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
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
  type Route,
} from "@/lib/test-api";
import { VerifyEmailStatus } from "./VerifyEmailStatus";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/verify-email" }));

const TOKEN = "a".repeat(43);

const invalidToken: Route = () =>
  errorResponse(400, "invalid_token", "This link is invalid or has expired");

function renderStatus(
  session: "signed_out" | "loading" = "signed_out",
  token: string | null = TOKEN,
) {
  return render(
    <StrictMode>
      <SessionProvider initialStatus={session}>
        <VerifyEmailStatus token={token ?? undefined} />
      </SessionProvider>
    </StrictMode>,
  );
}

beforeEach(() => {
  resetCsrf();
  window.history.replaceState(null, "", `/verify-email?token=${TOKEN}`);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("VerifyEmailStatus", () => {
  it("POSTs the token exactly once, even when strict mode runs effects twice", async () => {
    let sent: unknown;
    const fetchMock = serveApi({
      "GET /api/auth/csrf": csrf,
      "POST /api/auth/verify-email": (init) => {
        sent = bodyOf(init);
        return jsonResponse({ ok: true });
      },
    });
    renderStatus();
    expect(
      await screen.findByRole("heading", { name: "Your email is confirmed" }),
    ).toBeInTheDocument();
    expect(callsTo(fetchMock, "POST /api/auth/verify-email")).toBe(1);
    expect(sent).toEqual({ token: TOKEN });
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/signin");
  });

  it("removes the token from the address bar", async () => {
    serveApi({
      "GET /api/auth/csrf": csrf,
      "POST /api/auth/verify-email": () => jsonResponse({ ok: true }),
    });
    renderStatus();
    await screen.findByRole("heading", { name: "Your email is confirmed" });
    expect(window.location.pathname).toBe("/verify-email");
    expect(window.location.search).toBe("");
    expect(window.location.href).not.toContain(TOKEN);
  });

  it("offers a signed-in user the way to their dashboard", async () => {
    serveApi({
      "GET /api/auth/me": () => jsonResponse(meBody("employer")),
      "GET /api/auth/csrf": csrf,
      "POST /api/auth/verify-email": () => jsonResponse({ ok: true }),
    });
    renderStatus("loading");
    await screen.findByRole("heading", { name: "Your email is confirmed" });
    expect(await screen.findByRole("link", { name: "Go to your dashboard" })).toHaveAttribute(
      "href",
      "/employer",
    );
  });

  it("explains an expired link and tells a signed-out visitor how to get a new one", async () => {
    serveApi({ "GET /api/auth/csrf": csrf, "POST /api/auth/verify-email": invalidToken });
    renderStatus();
    expect(
      await screen.findByRole("heading", { name: "This link has expired or was already used" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/signin");
    expect(screen.queryByRole("button", { name: "Send a new link" })).not.toBeInTheDocument();
  });

  it("lets a signed-in unverified user send a new link", async () => {
    const fetchMock = serveApi({
      "GET /api/auth/me": () => jsonResponse(meBody("student", { verified: false })),
      "GET /api/auth/csrf": csrf,
      "POST /api/auth/verify-email": invalidToken,
      "POST /api/auth/resend-verification": () => jsonResponse({ ok: true }),
    });
    renderStatus("loading");
    await userEvent.click(await screen.findByRole("button", { name: "Send a new link" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "We sent a new link to student@example.test.",
    );
    expect(callsTo(fetchMock, "POST /api/auth/resend-verification")).toBe(1);
  });

  it("explains a resend limit", async () => {
    serveApi({
      "GET /api/auth/me": () => jsonResponse(meBody("student", { verified: false })),
      "GET /api/auth/csrf": csrf,
      "POST /api/auth/verify-email": invalidToken,
      "POST /api/auth/resend-verification": () =>
        errorResponse(429, "rate_limited", "Too many requests", {
          headers: { "retry-after": "1800" },
        }),
    });
    renderStatus("loading");
    await userEvent.click(await screen.findByRole("button", { name: "Send a new link" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Too many attempts. Try again in 30 minutes.",
    );
  });

  it("shows the invalid state without calling the api when the link has no token", async () => {
    window.history.replaceState(null, "", "/verify-email");
    const fetchMock = serveApi({});
    renderStatus("signed_out", null);
    expect(
      await screen.findByRole("heading", { name: "This link has expired or was already used" }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
