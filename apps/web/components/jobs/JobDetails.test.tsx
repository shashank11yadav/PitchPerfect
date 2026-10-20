import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JobDetails } from "./JobDetails";
import { publicCompany, publicJob, unverifiedListing } from "./test-fixtures";

describe("JobDetails", () => {
  it("shows the title, company, pay, where and how, and the skills", () => {
    render(<JobDetails job={publicJob()} company={publicCompany()} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Sales development representative" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Quarrow Logistics Software").length).toBeGreaterThan(0);
    expect(screen.getByText("$52,000–$60,000 per year + commission")).toBeInTheDocument();
    expect(screen.getByText("Boston, MA")).toBeInTheDocument();
    expect(screen.getByText("Hybrid")).toBeInTheDocument();
    expect(screen.getByText("Full-time")).toBeInTheDocument();
    const skills = screen.getByRole("list", { name: "Skills" });
    expect(
      within(skills)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Cold outreach", "Discovery questions"]);
    const posted = screen.getByText("Oct 12, 2026");
    expect(posted).toHaveAttribute("datetime", "2026-10-12T15:00:00.000Z");
    expect(posted.parentElement).toHaveTextContent("Posted Oct 12, 2026");
  });

  it("renders the description through SafeHtml, so only allowlisted markup survives", () => {
    const job = publicJob({
      descriptionHtml:
        '<p>Book <strong>first calls</strong>.</p><img src=x onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">click</a>',
    });
    const { container } = render(<JobDetails job={job} company={publicCompany()} />);
    const prose = container.querySelector(".pp-prose");
    expect(prose).not.toBeNull();
    expect(prose?.querySelector("strong")).toHaveTextContent("first calls");
    expect(container.querySelector("script, img, [onerror]")).toBeNull();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect(prose).toHaveTextContent("click");
  });

  it("marks a verified company and links its website and LinkedIn safely", () => {
    render(<JobDetails job={publicJob()} company={publicCompany()} />);
    expect(screen.getAllByText("Verified company").length).toBeGreaterThan(0);
    expect(screen.queryByText("Unverified employer")).not.toBeInTheDocument();
    for (const name of [/website/i, /linkedin/i]) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("href")).toMatch(/^https:\/\//);
    }
  });

  it("shows the unverified badge and a caution when the company isn't verified", () => {
    const { job, company } = unverifiedListing();
    render(<JobDetails job={job} company={company} />);
    expect(screen.getAllByText("Unverified employer").length).toBeGreaterThan(0);
    expect(screen.queryByText("Verified company")).not.toBeInTheDocument();
    expect(screen.getByText(/hasn.t confirmed an email/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /linkedin/i })).not.toBeInTheDocument();
  });

  it("never links a company URL that isn't https", () => {
    const company = publicCompany({
      website: "javascript:alert(1)",
      linkedinUrl: "http://linkedin.example/company/quarrow",
    });
    render(<JobDetails job={publicJob()} company={company} />);
    expect(screen.queryByRole("link", { name: /website/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /linkedin/i })).not.toBeInTheDocument();
  });

  it("renders whatever the caller puts in the actions slot", () => {
    render(
      <JobDetails
        job={publicJob()}
        company={publicCompany()}
        actions={<button type="button">Apply</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
  });

  it("steps every heading down one level inside the app, where the shell owns the h1", () => {
    render(<JobDetails job={publicJob()} company={publicCompany()} titleAs="h2" />);
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Sales development representative" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 3, name: /about quarrow/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "About the role" })).toBeInTheDocument();
  });

  it("steps down two levels for a preview under a page's own h2", () => {
    render(<JobDetails job={publicJob()} company={publicCompany()} titleAs="h3" />);
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Sales development representative" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: /about quarrow/i })).toBeInTheDocument();
  });
});
