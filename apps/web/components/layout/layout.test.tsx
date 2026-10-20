import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { EMPLOYER_NAV, PUBLIC_NAV, STUDENT_NAV } from "@/lib/site";
import { AppShell } from "./AppShell";
import { Footer } from "./Footer";
import { Navbar } from "./Navbar";
import { SkipLink } from "./SkipLink";

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

beforeEach(() => {
  pathname.current = "/";
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
    expect(within(nav).getByRole("link", { name: "Get started" })).toHaveAttribute(
      "href",
      "/signup",
    );
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
