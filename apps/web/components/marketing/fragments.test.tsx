import { redactPii } from "@pitchperfect/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RedactionFragment, ScoredLineFragment } from "./fragments";
import { DISCOVERY_MOMENT } from "./sample-session";

describe("RedactionFragment", () => {
  it("shows exactly what the real redaction makes of the typed turn", () => {
    render(<RedactionFragment />);
    const typed = screen.getByTestId("typed-turn").textContent;
    const stored = screen.getByTestId("stored-turn").textContent;
    expect(stored).toBe(redactPii(typed));
    expect(stored).toBe("I'll send the one-pager tonight. Reach me at [email] or [phone].");
  });

  it("uses reserved example contact details and keeps them from breaking across lines", () => {
    render(<RedactionFragment />);
    const typed = screen.getByTestId("typed-turn");
    expect(typed).toHaveTextContent("dana.k@example.test");
    expect(typed).toHaveTextContent("617-555-0142");
    for (const value of ["dana.k@example.test", "617-555-0142"]) {
      expect(screen.getByText(value)).toHaveClass("whitespace-nowrap");
    }
  });
});

describe("ScoredLineFragment", () => {
  it("quotes words the student actually said in the discovery call", () => {
    render(<ScoredLineFragment />);
    const quote = document.querySelector("blockquote")?.textContent ?? "";
    expect(quote.length).toBeGreaterThan(0);
    const said = DISCOVERY_MOMENT.transcript
      .filter((line) => line.role === "student")
      .map((line) => line.text)
      .join(" ");
    expect(said).toContain(quote);
  });
});
