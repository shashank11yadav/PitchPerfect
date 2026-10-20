import { APPLICATION_STATUSES } from "@pitchperfect/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusPill } from "./StatusPill";

describe("StatusPill", () => {
  it.each([
    ["applied", "Applied"],
    ["shortlisted", "Shortlisted"],
    ["interview", "Interview"],
    ["hired", "Hired"],
    ["rejected", "Not selected"],
    ["withdrawn", "Withdrawn"],
    ["closed", "Closed"],
  ] as const)("labels %s in words, not only colour", (status, label) => {
    render(<StatusPill status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("covers every status", () => {
    for (const status of APPLICATION_STATUSES) {
      const { container, unmount } = render(<StatusPill status={status} />);
      expect(container.textContent).not.toBe("");
      unmount();
    }
  });
});
