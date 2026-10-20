import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrf } from "@/lib/api";
import { SessionProvider } from "@/lib/session";
import { STUDENT_NAV } from "@/lib/site";
import { csrf, jsonResponse, meBody, serveApi, signedOut } from "@/lib/test-api";
import { RoleShell } from "./RoleShell";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const nav = vi.hoisted(() => ({ pathname: "/app" }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => nav.pathname }));

function show(pathname = "/app") {
  nav.pathname = pathname;
  let signedIn = true;
  serveApi({
    "GET /api/auth/me": (init) => (signedIn ? jsonResponse(meBody("student")) : signedOut(init)),
    "GET /api/auth/csrf": csrf,
    "POST /api/auth/signout": () => {
      signedIn = false;
      return new Response(null, { status: 204 });
    },
  });
  render(
    <SessionProvider initialStatus="loading">
      <RoleShell
        role="student"
        links={STUDENT_NAV}
        blocked="practice sessions and applying to jobs"
      >
        <p>page body</p>
      </RoleShell>
    </SessionProvider>,
  );
}

beforeEach(() => {
  resetCsrf();
  router.push.mockClear();
  router.replace.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RoleShell", () => {
  it("names the page after the section it's in", async () => {
    show("/app/learn/pitching");
    expect(await screen.findByRole("heading", { level: 1, name: "Learn" })).toBeInTheDocument();
    expect(await screen.findByText("page body")).toBeInTheDocument();
  });

  it("keeps settings in the account menu", async () => {
    show("/app/settings");
    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    // No section link claims the settings page, the dashboard included.
    expect(document.querySelector("[aria-current=page]")).toBeNull();
    const menu = await screen.findByRole("button", { name: /account/i });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/app/settings");
    await userEvent.keyboard("{Escape}");
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveFocus();
  });

  it("only links to student pages that exist, at most five tabs", () => {
    const hrefs = STUDENT_NAV.map((link) => link.href);
    expect(hrefs).toEqual([
      "/app",
      "/app/learn",
      "/app/practice",
      "/app/history",
      "/app/jobs",
      "/app/applications",
    ]);
    expect(STUDENT_NAV.filter((link) => link.tab).length).toBeLessThanOrEqual(5);
  });

  it("signs out to the home page, not back to sign-in", async () => {
    show("/app/jobs");
    await userEvent.click(await screen.findByRole("button", { name: /account/i }));
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/");
    });
    expect(router.replace).not.toHaveBeenCalled();
    expect(within(document.body).queryByText("page body")).not.toBeInTheDocument();
  });
});
