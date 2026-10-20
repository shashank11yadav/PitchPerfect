import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrf } from "@/lib/api";
import { SessionProvider } from "@/lib/session";
import { csrf, errorResponse, jsonResponse, meBody, serveApi, type Route } from "@/lib/test-api";
import { VerifyEmailBanner } from "./VerifyEmailBanner";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

function show(verified: boolean, resend: Route = () => jsonResponse({ ok: true })) {
  serveApi({
    "GET /api/auth/me": () => jsonResponse(meBody("student", { verified })),
    "GET /api/auth/csrf": csrf,
    "POST /api/auth/resend-verification": resend,
  });
  return render(
    <SessionProvider initialStatus="loading">
      <VerifyEmailBanner blocked="practice sessions and applying to jobs" />
      <p>page</p>
    </SessionProvider>,
  );
}

beforeEach(() => {
  resetCsrf();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VerifyEmailBanner", () => {
  it("says what's blocked until the email is confirmed, and sends a new link", async () => {
    show(false);
    const banner = await screen.findByRole("region", { name: /confirm your email/i });
    expect(banner).toHaveTextContent("practice sessions and applying to jobs");
    expect(banner).toHaveTextContent("student@example.test");

    await userEvent.click(screen.getByRole("button", { name: "Send a new link" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "We sent a new link to student@example.test.",
    );
  });

  it("explains the resend limit", async () => {
    show(false, () =>
      errorResponse(429, "rate_limited", "Too many requests", {
        headers: { "retry-after": "1500" },
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Send a new link" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Try again in 25 minutes.");
  });

  it("isn't shown once the email is confirmed", async () => {
    show(true);
    await screen.findByText("page");
    // Let the session load.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("region", { name: /confirm your email/i })).not.toBeInTheDocument();
  });
});
