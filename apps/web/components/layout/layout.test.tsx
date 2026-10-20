import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { resetCsrf } from "@/lib/api";
import { SessionProvider } from "@/lib/session";
import { EMPLOYER_NAV, PUBLIC_NAV, STUDENT_NAV } from "@/lib/site";
import { callsTo, csrf, jsonResponse, meBody, serveApi, signedOut } from "@/lib/test-api";
import { AppShell } from "./AppShell";
import { Footer } from "./Footer";
import { Navbar } from "./Navbar";
import { SkipLink } from "./SkipLink";

const pathname = vi.hoisted(() => ({ current: "/" }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => router,
}));

beforeEach(() => {
  pathname.current = "/";
  router.push.mockReset();
  resetCsrf();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SkipLink", () => {
  it("jumps to the main landmark", () => {
    render(<SkipLink />);
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute(
      "href",
      "#main",
    );
  });
});

describe("Navbar", () => {
  it("shows the public links, sign in, and get started, marking the current page", () => {
    pathname.current = "/jobs/some-job";
    render(<Navbar />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("img", { name: "PitchPerfect" })).toBeInTheDocument();
    for (const { label } of PUBLIC_NAV) {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(within(nav).getByRole("link", { name: "Jobs" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Students" })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/signup");
  });

  it("toggles the mobile menu", async () => {
    render(<Navbar />);
    const toggle = screen.getByRole("button", { name: "Menu" });
    const menu = document.getElementById("mobile-nav");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(menu).not.toBeVisible();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(menu).toBeVisible();
  });

  it("moves focus into the opened menu, and Escape closes it and returns focus", async () => {
    render(<Navbar />);
    const toggle = screen.getByRole("button", { name: "Menu" });
    const menu = document.getElementById("mobile-nav");
    if (!menu) throw new Error("no mobile menu");
    await userEvent.click(toggle);
    expect(within(menu).getByRole("link", { name: "Students" })).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(menu).not.toBeVisible();
    expect(toggle).toHaveFocus();
  });

  it("closes the menu when a link in it is followed", async () => {
    // jsdom can't navigate; stop the link's default action after React has handled the click.
    const stopNavigation = (event: MouseEvent) => {
      event.preventDefault();
    };
    window.addEventListener("click", stopNavigation);
    onTestFinished(() => {
      window.removeEventListener("click", stopNavigation);
    });
    render(<Navbar />);
    const toggle = screen.getByRole("button", { name: "Menu" });
    const menu = document.getElementById("mobile-nav");
    if (!menu) throw new Error("no mobile menu");
    await userEvent.click(toggle);
    await userEvent.click(within(menu).getByRole("link", { name: "Employers" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});

describe("Navbar with a session", () => {
  const renderWithSession = (initialStatus: "loading" | "signed_out") =>
    render(
      <SessionProvider initialStatus={initialStatus}>
        <Navbar />
      </SessionProvider>,
    );

  it("shows a signed-in student their dashboard and sign out instead of sign in and sign up", async () => {
    serveApi({ "GET /api/auth/me": () => jsonResponse(meBody("student")) });
    renderWithSession("loading");
    const nav = screen.getByRole("navigation", { name: "Main" });
    const dashboard = await within(nav).findByRole("link", { name: "Dashboard" });
    expect(dashboard).toHaveAttribute("href", "/app");
    expect(within(nav).getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Sign up" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    const menu = document.getElementById("mobile-nav");
    if (!menu) throw new Error("no mobile menu");
    expect(within(menu).getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/app");
    expect(within(menu).getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("points an employer at the employer dashboard", async () => {
    serveApi({ "GET /api/auth/me": () => jsonResponse(meBody("employer")) });
    renderWithSession("loading");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(await within(nav).findByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/employer",
    );
  });

  it("holds the actions' space with neither set while the session loads", () => {
    serveApi({ "GET /api/auth/me": () => new Promise<Response>(() => undefined) });
    renderWithSession("loading");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(nav.querySelector("[data-session-actions]")).toHaveAttribute("aria-busy", "true");
  });

  it("shows sign in and sign up at once, with no api call, when there's no session cookie", () => {
    const fetchMock = serveApi({});
    renderWithSession("signed_out");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/signin");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("signs out from the navbar and goes home", async () => {
    let me = () => jsonResponse(meBody("student"));
    const fetchMock = serveApi({
      "GET /api/auth/me": () => me(),
      "GET /api/auth/csrf": csrf,
      "POST /api/auth/signout": () => {
        me = () => signedOut(undefined) as Response;
        return new Response(null, { status: 204 });
      },
    });
    renderWithSession("loading");
    const nav = screen.getByRole("navigation", { name: "Main" });
    await userEvent.click(await within(nav).findByRole("button", { name: "Sign out" }));

    expect(await within(nav).findByRole("link", { name: "Sign in" })).toBeInTheDocument();
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/");
    });
    expect(callsTo(fetchMock, "POST /api/auth/signout")).toBe(1);
  });
});

describe("Footer", () => {
  it("is a contentinfo landmark with product and legal links", () => {
    render(<Footer />);
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(within(footer).getByRole("link", { name: "How it works" })).toBeInTheDocument();
  });
});

describe("AppShell", () => {
  it("renders the title as the h1, the main landmark, and the role's links", () => {
    pathname.current = "/app/practice/pitching";
    render(
      <AppShell links={STUDENT_NAV} title="Practice">
        content
      </AppShell>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Practice" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    const [sidebar] = screen.getAllByRole("navigation", { name: "App" });
    if (!sidebar) throw new Error("no sidebar");
    expect(within(sidebar).getAllByRole("link")).toHaveLength(STUDENT_NAV.length);
    // The longest matching link is current, not the dashboard prefix.
    expect(within(sidebar).getByRole("link", { name: "Practice" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(sidebar).getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("puts at most five tab links in the mobile tab bar", () => {
    render(
      <AppShell links={STUDENT_NAV} title="Dashboard">
        content
      </AppShell>,
    );
    const tabs = screen.getByRole("navigation", { name: "Tabs" });
    const labels = within(tabs)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(labels).toEqual(STUDENT_NAV.filter((link) => link.tab).map((link) => link.label));
    expect(labels.length).toBeLessThanOrEqual(5);
  });

  it("opens the full menu on mobile", async () => {
    render(
      <AppShell links={EMPLOYER_NAV} title="Jobs">
        content
      </AppShell>,
    );
    const toggle = screen.getByRole("button", { name: "Menu" });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("app-menu")).toBeVisible();
  });
});
