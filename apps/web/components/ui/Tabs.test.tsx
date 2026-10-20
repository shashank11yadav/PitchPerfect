import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tabs } from "./Tabs";

const TABS = [
  { id: "overview", label: "Overview", content: "Overview panel" },
  { id: "rubric", label: "Rubric", content: "Rubric panel" },
  { id: "transcript", label: "Transcript", content: "Transcript panel" },
];

describe("Tabs", () => {
  it("links tabs to panels and shows only the selected panel", () => {
    render(<Tabs tabs={TABS} label="Scorecard" defaultTab="rubric" />);
    expect(screen.getByRole("tablist", { name: "Scorecard" })).toBeInTheDocument();
    const rubric = screen.getByRole("tab", { name: "Rubric" });
    expect(rubric).toHaveAttribute("aria-selected", "true");
    expect(rubric).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tabpanel", { name: "Rubric" })).toHaveTextContent("Rubric panel");
    expect(screen.queryByText("Overview panel")).not.toBeVisible();
  });

  it("moves selection with arrow keys, Home and End, wrapping around", async () => {
    const user = userEvent.setup();
    render(<Tabs tabs={TABS} label="Scorecard" />);
    await user.click(screen.getByRole("tab", { name: "Overview" }));

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Transcript" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Transcript" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveFocus();

    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Transcript" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveFocus();
    expect(screen.getByText("Overview panel")).toBeVisible();
  });
});
