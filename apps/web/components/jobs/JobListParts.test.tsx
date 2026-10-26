import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JobCard } from "./JobCard";
import { JobFilters } from "./JobFilters";
import { jobSummary } from "./test-fixtures";

describe("JobCard", () => {
  it("links to the public job page by default, at list size", () => {
    render(<JobCard job={jobSummary()} />);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toHaveClass("md:text-h2");
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/jobs/sales-development-representative-a1b2c3",
    );
  });

  it("shows the domain a verified company's badge vouches for", () => {
    const job = jobSummary();
    render(
      <JobCard
        job={{
          ...job,
          company: { ...job.company, name: "Google LLC", verifiedDomain: "acme-demo.example" },
        }}
      />,
    );
    expect(screen.getByText("Google LLC")).toHaveTextContent("Verified · acme-demo.example");
  });

  it("takes an app link, heading level and the smaller compact size", () => {
    render(
      <JobCard
        job={jobSummary()}
        href="/app/jobs/sales-development-representative-a1b2c3"
        headingLevel="h2"
        compact
      />,
    );
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveClass("text-h4");
    expect(heading).not.toHaveClass("md:text-h2");
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/app/jobs/sales-development-representative-a1b2c3",
    );
  });
});

describe("JobFilters", () => {
  it("searches the public board by default", () => {
    render(<JobFilters query={{ page: 1, q: "sales" }} />);
    expect(screen.getByRole("search")).toHaveAttribute("action", "/jobs");
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/jobs");
  });

  it("searches, and clears back to, the page it's given", () => {
    render(<JobFilters query={{ page: 1, q: "sales" }} action="/app/jobs" />);
    expect(screen.getByRole("search")).toHaveAttribute("action", "/app/jobs");
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/app/jobs",
    );
  });
});
