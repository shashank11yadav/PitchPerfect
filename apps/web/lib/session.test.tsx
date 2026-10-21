import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrf } from "./api";
import { RequireRole, SessionProvider, SignedOutOnly, useSession } from "./session";
import {
  callsTo,
  csrf,
  errorResponse,
  jsonResponse,
  meBody,
  serveApi,
  signedOut,
} from "./test-api";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/" }));

function Probe() {
  const session = useSession();
  return (
    <div>
      <p>status: {session.status}</p>
      <p>email: {session.user?.email ?? "none"}</p>
      <button type="button" onClick={() => void session.signOut()}>
        Sign out
      </button>
      <button type="button" onClick={() => void session.refresh()}>
        Refresh
      </button>
    </div>
  );
}

beforeEach(() => {
  resetCsrf();
  router.push.mockReset();
  router.replace.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("SessionProvider", () => {
  it("starts signed out without asking the api when there's no session cookie", () => {
    const fetchMock = serveApi({});
    render(
      <SessionProvider initialStatus="signed_out">
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByText("status: signed_out")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks /auth/me when there may be a session, and exposes the user", async () => {
    serveApi({ "GET /api/auth/me": () => jsonResponse(meBody("student")) });
    render(
      <SessionProvider initialStatus="loading">
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByText("status: loading")).toBeInTheDocument();
    expect(await screen.findByText("status: signed_in")).toBeInTheDocument();
    expect(screen.getByText("email: student@example.test")).toBeInTheDocument();
  });

  it("treats a 401 as the normal signed-out case and logs nothing", async () => {
    const consoleError = vi.spyOn(console, "error");
    const consoleWarn = vi.spyOn(console, "warn");
    serveApi({ "GET /api/auth/me": signedOut });
    render(
      <SessionProvider initialStatus="loading">
        <Probe />
      </SessionProvider>,
    );
    expect(await screen.findByText("status: signed_out")).toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("tells an api outage apart from being signed out", async () => {
    serveApi({ "GET /api/auth/me": () => errorResponse(503, "internal_error", "Down") });
    render(
      <SessionProvider initialStatus="loading">
        <Probe />
      </SessionProvider>,
    );
    expect(await screen.findByText("status: unavailable")).toBeInTheDocument();
  });

  it("refresh picks up a new sign-in", async () => {
    let me = signedOut;
    serveApi({ "GET /api/auth/me": (init) => me(init) });
    render(
      <SessionProvider initialStatus="signed_out">
        <Probe />
      </SessionProvider>,
    );
    me = () => jsonResponse(meBody("employer"));
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("email: employer@example.test")).toBeInTheDocument();
  });

  it("signs out: POSTs with CSRF, drops the old token, refreshes, then goes home", async () => {
    let me = () => jsonResponse(meBody("student"));
    let tokens = 0;
    const fetchMock = serveApi({
      "GET /api/auth/me": () => me(),
      "GET /api/auth/csrf": () => jsonResponse({ csrfToken: `token-${String(++tokens)}` }),
      "POST /api/auth/signout": (init) => {
        expect(new Headers(init?.headers).get("x-csrf-token")).toBe("token-1");
        me = () => errorResponse(401, "unauthenticated", "Sign in first");
        return new Response(null, { status: 204 });
      },
      "POST /api/auth/resend-verification": (init) => {
        // The next state-changing request fetches a token for the new session.
        expect(new Headers(init?.headers).get("x-csrf-token")).toBe("token-2");
        return jsonResponse({ ok: true });
      },
    });
    render(
      <SessionProvider initialStatus="loading">
        <Probe />
      </SessionProvider>,
    );
    await screen.findByText("status: signed_in");
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByText("status: signed_out")).toBeInTheDocument();
    expect(router.push).toHaveBeenCalledWith("/");
    expect(callsTo(fetchMock, "GET /api/auth/me")).toBe(2);
    const { apiFetch } = await import("./api");
    await apiFetch("/auth/resend-verification", { method: "POST" });
    expect(tokens).toBe(2);
  });
});

describe("RequireRole", () => {
  it("sends a signed-out visitor to sign in with the page as next", async () => {
    window.history.replaceState(null, "", "/app/practice?skill=discovery-questions");
    serveApi({ "GET /api/auth/me": signedOut });
    render(
      <SessionProvider initialStatus="loading">
        <RequireRole role="student">
          <p>Practice room</p>
        </RequireRole>
      </SessionProvider>,
    );
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith(
        "/signin?next=%2Fapp%2Fpractice%3Fskill%3Ddiscovery-questions",
      );
    });
    expect(screen.queryByText("Practice room")).not.toBeInTheDocument();
  });

  it("keeps a signed-in user on the page with a retry when the api is down", async () => {
    let me = () => errorResponse(503, "internal_error", "Down");
    serveApi({ "GET /api/auth/me": () => me() });
    render(
      <SessionProvider initialStatus="loading">
        <RequireRole role="student">
          <p>Practice room</p>
        </RequireRole>
      </SessionProvider>,
    );
    expect(await screen.findByText(/can.t reach your account/i)).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
    me = () => jsonResponse(meBody("student"));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Practice room")).toBeInTheDocument();
  });

  it("sends the wrong role to its own home", async () => {
    serveApi({ "GET /api/auth/me": () => jsonResponse(meBody("employer")) });
    render(
      <SessionProvider initialStatus="loading">
        <RequireRole role="student">
          <p>Practice room</p>
        </RequireRole>
      </SessionProvider>,
    );
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/employer");
    });
    expect(screen.queryByText("Practice room")).not.toBeInTheDocument();
  });

  it("shows the page to the right role, with a loading status first", async () => {
    serveApi({ "GET /api/auth/me": () => jsonResponse(meBody("student")) });
    render(
      <SessionProvider initialStatus="loading">
        <RequireRole role="student">
          <p>Practice room</p>
        </RequireRole>
      </SessionProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    expect(await screen.findByText("Practice room")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("SignedOutOnly", () => {
  it("sends a signed-in user to their home instead of showing the form", async () => {
    serveApi({
      "GET /api/auth/me": () => jsonResponse(meBody("employer")),
      "GET /api/auth/csrf": csrf,
    });
    render(
      <SessionProvider initialStatus="loading">
        <SignedOutOnly>
          <p>Sign-in form</p>
        </SignedOutOnly>
      </SessionProvider>,
    );
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/employer");
    });
    expect(screen.queryByText("Sign-in form")).not.toBeInTheDocument();
  });

  it.each([
    ["/app/practice", "/app/practice"],
    ["//evil.test", "/app"],
  ])("follows a safe next (%s → %s)", async (next, expected) => {
    serveApi({ "GET /api/auth/me": () => jsonResponse(meBody("student")) });
    render(
      <SessionProvider initialStatus="loading">
        <SignedOutOnly next={next}>
          <p>Sign-in form</p>
        </SignedOutOnly>
      </SessionProvider>,
    );
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith(expected);
    });
  });

  it("shows the form straight away when there's no session cookie", () => {
    serveApi({});
    render(
      <SessionProvider initialStatus="signed_out">
        <SignedOutOnly>
          <p>Sign-in form</p>
        </SignedOutOnly>
      </SessionProvider>,
    );
    expect(screen.getByText("Sign-in form")).toBeInTheDocument();
  });
});
