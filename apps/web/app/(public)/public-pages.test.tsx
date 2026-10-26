import { LIMITS } from "@pitchperfect/shared";
import type { Metadata } from "next";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AboutPage, { metadata as about } from "./about/page";
import EmployersPage, { metadata as employers } from "./employers/page";
import HowItWorksPage, { metadata as howItWorks } from "./how-it-works/page";
import PublicLayout from "./layout";
import HomePage, { metadata as home } from "./page";
import PrivacyPage, { metadata as privacy } from "./privacy/page";
import StudentsPage, { metadata as students } from "./students/page";
import TermsPage, { metadata as terms } from "./terms/page";
import { forgetPracticePartnerKind } from "@/lib/practice-partner";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

/** A page component: the legal pages are async server components that ask the api about the partner. */
type PageComponent = () => ReactNode | Promise<ReactNode>;

const fetchMock = vi.fn<typeof fetch>();
const healthBody = (practicePartner: "scripted" | "live") =>
  new Response(JSON.stringify({ status: "ok", db: "ok", coach: "ok", practicePartner }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  // By default the api can't be reached, which the pages must read as a live partner.
  fetchMock.mockRejectedValue(new TypeError("fetch failed"));
  vi.stubGlobal("fetch", fetchMock);
  forgetPracticePartnerKind();
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const PAGES: [string, PageComponent, Metadata][] = [
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

  it("renders one h1 inside the main landmark, between the navbar and footer", async () => {
    render(<PublicLayout>{await Page()}</PublicLayout>);
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
  it("carries FAQPage structured data", async () => {
    const { container } = render(await HowItWorksPage());
    expect(jsonLdTypes(container)).toEqual(["FAQPage"]);
  });
});

describe.each([
  ["/privacy", PrivacyPage],
  ["/terms", TermsPage],
])("%s", (_path, Page) => {
  it("shows the demo template notice", async () => {
    render(await Page());
    expect(screen.getByRole("note")).toHaveTextContent("Demo template — not legal advice.");
  });
});

describe("privacy page", () => {
  it("describes the real data flows", async () => {
    const { container: main } = render(await PrivacyPage());
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
  it("says how long the rate-limit store keeps IP addresses and email-derived keys", async () => {
    const { container } = render(await PrivacyPage());
    const retention = container.querySelector("#retention + div");
    expect(retention).toHaveTextContent(/IP address/);
    expect(retention).toHaveTextContent(/email/);
    expect(retention).toHaveTextContent(/an hour/);
  });

  it("asks only students to confirm they are 18 or older", async () => {
    render(await PrivacyPage());
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
  ])("%s states the session limits", async (_path, Page) => {
    const { container } = render(await Page());
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

  it("states transcript retention from the shared limit", async () => {
    const { container } = render(await PrivacyPage());
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

  it("keeps the browser speech caveat in the privacy summary", async () => {
    const { container } = render(await PrivacyPage());
    const summary = container.querySelector("#summary + div");
    expect(summary).toHaveTextContent("only the text reaches us");
    expect(summary).toHaveTextContent("(Google, Apple, or Microsoft)");
  });
});

describe("final review: the legal pages describe the partner that is really running", () => {
  const SCRIPTED =
    "This demo’s practice partner is scripted and runs on our server; what you say isn’t sent to an AI provider.";

  it("privacy keeps the AI provider wording when the api can't say otherwise", async () => {
    const { container } = render(await PrivacyPage());
    expect(container).toHaveTextContent(
      "our AI provider (OpenAI or Anthropic, depending on configuration)",
    );
    expect(container).not.toHaveTextContent(SCRIPTED);
  });

  it("privacy says the scripted partner stays on our server when the coach runs the demo", async () => {
    fetchMock.mockResolvedValue(healthBody("scripted"));
    const { container } = render(await PrivacyPage());
    expect(container).toHaveTextContent(SCRIPTED);
    expect(container).not.toHaveTextContent(/our AI provider/);
    expect(container.querySelector("#processors + div")).toHaveTextContent(/scripted/);
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/api\/health$/);
  });

  it("terms call the partner scripted when the coach runs the demo, and AI when it doesn't", async () => {
    fetchMock.mockResolvedValue(healthBody("scripted"));
    const scripted = render(await TermsPage());
    expect(scripted.container).toHaveTextContent("The practice partner is scripted, not a person");
    expect(scripted.container).not.toHaveTextContent(/AI provider|is an AI/);
    scripted.unmount();

    forgetPracticePartnerKind();
    fetchMock.mockResolvedValue(healthBody("live"));
    const live = render(await TermsPage());
    expect(live.container).toHaveTextContent("The practice partner is an AI, not a person");
    expect(live.container).toHaveTextContent(/our AI provider/);
  });

  it("how it works says nothing leaves PitchPerfect in the scripted demo, and labels the partner truthfully", async () => {
    fetchMock.mockResolvedValue(healthBody("scripted"));
    const scripted = render(await HowItWorksPage());
    expect(scripted.container).toHaveTextContent(
      "In this demo your text isn't sent to an AI provider.",
    );
    expect(scripted.container).not.toHaveTextContent(/sent to our AI provider/);
    expect(scripted.container).toHaveTextContent("labelled as a scripted demo wherever it appears");
    expect(scripted.container).not.toHaveTextContent(/labelled as AI|an AI buyer/);
    scripted.unmount();

    forgetPracticePartnerKind();
    fetchMock.mockResolvedValue(healthBody("live"));
    const live = render(await HowItWorksPage());
    expect(live.container).toHaveTextContent("sent to our AI provider");
    expect(live.container).toHaveTextContent("labelled as AI wherever it appears");
    expect(live.container).not.toHaveTextContent(/leaves PitchPerfect/);
  });

  it("asks the api about the partner once a minute, not once a render", async () => {
    fetchMock.mockResolvedValue(healthBody("scripted"));
    render(await PrivacyPage());
    render(await TermsPage());
    render(await HowItWorksPage());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("the about page and the home FAQ stay true for either partner", () => {
    const about = render(<AboutPage />);
    expect(about.container).toHaveTextContent("The partner is software, and it says so.");
    expect(about.container).not.toHaveTextContent(/partner is an AI/);
    about.unmount();
    const { container } = render(<HomePage />);
    expect(container).toHaveTextContent(
      "that's a scripted partner or a live model from OpenAI or Anthropic; the public demo uses the scripted one",
    );
    expect(container).not.toHaveTextContent(/labelled as AI everywhere/);
  });

  it("no page that can't ask the api calls the partner an AI", () => {
    for (const Page of [HomePage, StudentsPage, EmployersPage, AboutPage]) {
      const { container, unmount } = render(<PublicLayout>{Page()}</PublicLayout>);
      expect(container).not.toHaveTextContent(/\bAI\b/);
      unmount();
    }
    for (const page of [home, students, employers, about]) {
      expect(page.description).not.toMatch(/\bAI\b/);
    }
  });

  it("terms don't claim every employer must sign up with a company address", async () => {
    const { container } = render(await TermsPage());
    expect(container).toHaveTextContent(
      "should use an address at that company; otherwise the company shows as unverified until we approve it",
    );
    expect(container).not.toHaveTextContent(/and sign up with an email address at that company/);
  });
});
