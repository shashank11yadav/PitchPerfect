import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EvidenceExplorer } from "./EvidenceExplorer";
import { SAMPLE_SCORECARD } from "./sample-session";

const evidenceFor = (key: string) =>
  SAMPLE_SCORECARD.dimensions.find((dimension) => dimension.key === key)?.evidence;

describe("EvidenceExplorer", () => {
  it("starts on the practiced skill's line, with its quote marked, before any script runs", () => {
    const server = document.createElement("div");
    server.innerHTML = renderToString(<EvidenceExplorer />);
    expect(server.querySelector("mark")).toHaveTextContent(String(evidenceFor("objections")));
    expect(server.querySelector('[aria-pressed="true"]')).toHaveTextContent(/^Objection handling/);
  });

  it("marks the words behind the score you pick", async () => {
    render(<EvidenceExplorer />);
    await userEvent.click(screen.getByRole("button", { name: /^Discovery questions/ }));
    expect(screen.getByRole("button", { name: /^Discovery questions/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const transcript = screen.getByRole("list", { name: "Sample transcript" });
    const marks = transcript.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent(String(evidenceFor("discovery")));
    expect(screen.getByText(/^Discovery questions, 3 out of 5/)).toBeInTheDocument();
  });

  it("says so when a score has no single quote behind it", async () => {
    render(<EvidenceExplorer />);
    await userEvent.click(screen.getByRole("button", { name: /^Structure/ }));
    const transcript = screen.getByRole("list", { name: "Sample transcript" });
    expect(transcript.querySelectorAll("mark")).toHaveLength(0);
    expect(screen.getByText(/no single line to mark/)).toBeInTheDocument();
    expect(within(transcript).getAllByRole("listitem").length).toBeGreaterThan(0);
  });
});
