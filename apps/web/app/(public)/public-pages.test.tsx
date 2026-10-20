import { LIMITS } from "@pitchperfect/shared";
import type { Metadata } from "next";
import { render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";
import AboutPage, { metadata as about } from "./about/page";
import EmployersPage, { metadata as employers } from "./employers/page";
import HowItWorksPage, { metadata as howItWorks } from "./how-it-works/page";
import PublicLayout from "./layout";
import HomePage, { metadata as home } from "./page";
import PrivacyPage, { metadata as privacy } from "./privacy/page";
import StudentsPage, { metadata as students } from "./students/page";
import TermsPage, { metadata as terms } from "./terms/page";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const PAGES: [string, ComponentType, Metadata][] = [
  ["/", HomePage, home],
  ["/students", StudentsPage, students],
  ["/employers", EmployersPage, employers],
  ["/how-it-works", HowItWorksPage, howItWorks],
  ["/about", AboutPage, about],
  ["/privacy", PrivacyPage, privacy],
  ["/terms", TermsPage, terms],
];

const canonicalPath = (metadata: Metadata) => {
  const canonical = metadata.alternates?.canonical;
  if (typeof canonical !== "string") throw new Error("canonical is not a string");
  return new URL(canonical).pathname;
};

describe.each(PAGES)("%s", (path, Page, metadata) => {
  it("has a canonical URL, a title and a 140–160 character description", () => {
    expect(canonicalPath(metadata)).toBe(path);
    expect(typeof metadata.title).toBe("string");
    expect(metadata.description?.length).toBeGreaterThanOrEqual(140);
    expect(metadata.description?.length).toBeLessThanOrEqual(160);
  });

  it("renders one h1 inside the main landmark, between the navbar and footer", () => {
    render(
      <PublicLayout>
        <Page />
      </PublicLayout>,
    );
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(within(main).getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
});

describe("public page metadata", () => {
  it("is unique per page", () => {
    const descriptions = PAGES.map(([, , metadata]) => metadata.description);
    const titles = PAGES.map(([, , metadata]) => metadata.title);
    expect(new Set(descriptions).size).toBe(PAGES.length);
    expect(new Set(titles).size).toBe(PAGES.length);
  });
});

const jsonLdTypes = (container: HTMLElement) =>
  [...container.querySelectorAll('script[type="application/ld+json"]')].flatMap((script) => {
    const data: unknown = JSON.parse(script.textContent);
    return [data].flat().map((item) => (item as { "@type": string })["@type"]);
  });

describe("home page", () => {
  it("leads with the tagline and the two calls to action", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Practice your pitch. Get hired.",
    );
    const hrefs = (name: string) =>
      screen.getAllByRole("link", { name }).map((link) => link.getAttribute("href"));
    expect(new Set(hrefs("Start practicing"))).toEqual(new Set(["/signup/student"]));
    expect(new Set(hrefs("I'm hiring"))).toEqual(new Set(["/employers"]));
  });

  it("carries Organization, WebSite and FAQPage structured data", () => {
    const { container } = render(<HomePage />);
    expect(jsonLdTypes(container).sort()).toEqual(["FAQPage", "Organization", "WebSite"]);
  });
});

describe("how it works page", () => {
  it("carries FAQPage structured data", () => {
    const { container } = render(<HowItWorksPage />);
    expect(jsonLdTypes(container)).toEqual(["FAQPage"]);
  });
});

describe.each([
  ["/privacy", PrivacyPage],
  ["/terms", TermsPage],
])("%s", (_path, Page) => {
  it("shows the demo template notice", () => {
    render(<Page />);
    expect(screen.getByRole("note")).toHaveTextContent("Demo template — not legal advice.");
  });
});

describe("privacy page", () => {
  it("describes the real data flows", () => {
    const { container: main } = render(<PrivacyPage />);
    for (const fact of [
      "our AI provider (OpenAI or Anthropic, depending on configuration)",
      "180 days",
      "Google, Apple or Microsoft",
      "18 or older",
      "the maintainer listed on the project's GitHub page",
      "pp.sid",
    ]) {
      expect(main).toHaveTextContent(fact);
    }
    expect(main).toHaveTextContent(/no (advertising|analytics|tracking)/i);
  });
});

describe("privacy page, carried review fixes", () => {
  it("says how long the rate-limit store keeps IP addresses and email-derived keys", () => {
    const { container } = render(<PrivacyPage />);
    const retention = container.querySelector("#retention + div");
    expect(retention).toHaveTextContent(/IP address/);
    expect(retention).toHaveTextContent(/email/);
    expect(retention).toHaveTextContent(/an hour/);
  });

  it("asks only students to confirm they are 18 or older", () => {
    render(<PrivacyPage />);
    const account = screen.getByText("Account:").closest("li");
    expect(account).toHaveTextContent("Students also confirm they are 18 or older");
    expect(account).not.toHaveTextContent(/employer, and the date you confirmed/);
  });
});

describe("numbers in the copy come from the shared limits", () => {
  const minutes = String(LIMITS.sessionSeconds / 60);
  const chars = LIMITS.turnMaxChars.toLocaleString("en-US");

  it.each([
    ["/how-it-works", HowItWorksPage],
    ["/terms", TermsPage],
  ])("%s states the session limits", (_path, Page) => {
    const { container } = render(<Page />);
    expect(container).toHaveTextContent(`${String(LIMITS.maxStudentTurns)} of your turns`);
    expect(container).toHaveTextContent(`${minutes} minutes`);
    expect(container).toHaveTextContent(`${chars} characters`);
  });

  it("labels the env-configurable session quota as a default", () => {
    render(<HomePage />);
    const answer = screen.getByText(/practice sessions a day/);
    expect(answer).toHaveTextContent(
      `${String(LIMITS.dailyQuota)} practice sessions a day and ${String(LIMITS.monthlyQuota)} a month`,
    );
    expect(answer).toHaveTextContent(/default/i);
  });

  it("states transcript retention from the shared limit", () => {
    const { container } = render(<PrivacyPage />);
    expect(container).toHaveTextContent(`${String(LIMITS.attemptRetentionDays)} days`);
  });
});

describe("fix round 1", () => {
  it("shows Maya's persona card once on the home page", () => {
    render(<HomePage />);
    expect(screen.getAllByRole("region", { name: "Maya Chen" })).toHaveLength(1);
  });

  it("gives the employers page its own applicants, not the home page's", () => {
    const { container } = render(<EmployersPage />);
    expect(container).not.toHaveTextContent("Jordan Ellis");
    // One hiring story: the applicant list, the job post and the invite are all the SDR role.
    expect(container).toHaveTextContent("Sample applicants");
    const invitee = screen.getByText("Interview invite").parentElement;
    const name = invitee?.querySelector("p.font-display")?.textContent ?? "";
    expect(screen.getAllByText(name).length).toBeGreaterThan(1);
  });

  it("never suggests employers can listen to candidates", () => {
    for (const Page of [HomePage, EmployersPage]) {
      const { container, unmount } = render(<Page />);
      expect(container).not.toHaveTextContent(/\bhear\b/i);
      unmount();
    }
  });

  it("states the session cap as 'up to … whichever comes first' on the students page", () => {
    const { container } = render(<StudentsPage />);
    expect(container).toHaveTextContent(
      `up to ${String(LIMITS.maxStudentTurns)} turns or ${String(LIMITS.sessionSeconds / 60)} minutes, whichever comes first`,
    );
  });

  it("keeps the browser speech caveat in the privacy summary", () => {
    const { container } = render(<PrivacyPage />);
    const summary = container.querySelector("#summary + div");
    expect(summary).toHaveTextContent("only the text reaches us");
    expect(summary).toHaveTextContent("(Google, Apple, or Microsoft)");
  });
});
