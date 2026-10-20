import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./Badge";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { JsonLd } from "./JsonLd";
import { Skeleton } from "./Skeleton";
import { Spinner } from "./Spinner";

describe("display primitives", () => {
  it("Badge always carries its meaning as text", () => {
    render(<Badge tone="warning">Unverified</Badge>);
    expect(screen.getByText("Unverified")).toHaveClass("text-ink");
  });

  it("Card renders the requested element", () => {
    render(
      <Card as="section" aria-label="Quota">
        3 sessions left
      </Card>,
    );
    expect(screen.getByRole("region", { name: "Quota" })).toHaveTextContent("3 sessions left");
  });

  it("EmptyState has a heading, description and action", () => {
    render(
      <EmptyState
        title="No attempts yet"
        description="Your scorecards will appear here."
        action={<a href="/app/practice">Start practice</a>}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "No attempts yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start practice" })).toBeInTheDocument();
  });

  it("Skeleton is hidden from assistive tech", () => {
    const { container } = render(<Skeleton className="h-4" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("Spinner is decorative unless labelled", () => {
    const { container } = render(<Spinner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    render(<Spinner label="Loading jobs" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading jobs");
  });

  it("JsonLd escapes characters that could end the script element", () => {
    const { container } = render(
      <JsonLd data={{ "@type": "Organization", name: "</script><script>alert(1)</script>" }} />,
    );
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script?.innerHTML).not.toContain("</script>");
    expect(JSON.parse(script?.textContent ?? "")).toEqual({
      "@type": "Organization",
      name: "</script><script>alert(1)</script>",
    });
  });
});
