import { act, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { observeEntries, stubReducedMotion } from "@/components/motion/test-utils";
import { PersonaCard } from "./PersonaCard";
import { RubricBar } from "./RubricBar";
import { ScoreRing, scoreBand } from "./ScoreRing";
import { TranscriptBubble } from "./TranscriptBubble";

const useFakeFrames = () =>
  vi.useFakeTimers({
    toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "performance"],
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("PersonaCard", () => {
  it("labels a scripted demo partner as scripted, not as AI", () => {
    render(
      <PersonaCard
        partner="scripted"
        persona={{
          personaName: "Maya Chen",
          personaTitle: "VP Operations",
          companyType: "Regional logistics company",
          personality: "Direct",
        }}
      />,
    );
    const card = screen.getByRole("region", { name: "Maya Chen" });
    expect(within(card).getByText("Scripted demo partner")).toBeInTheDocument();
    expect(within(card).queryByText("AI practice partner")).toBeNull();
  });

  it("labels a marketing page's sample buyer as a sample, not as AI or scripted", () => {
    render(
      <PersonaCard
        partner="sample"
        persona={{
          personaName: "Maya Chen",
          personaTitle: "VP Operations",
          companyType: "Regional logistics company",
          personality: "Direct",
        }}
      />,
    );
    const card = screen.getByRole("region", { name: "Maya Chen" });
    expect(within(card).getByText("Sample buyer")).toBeInTheDocument();
    expect(within(card).queryByText(/AI practice partner|Scripted demo partner/)).toBeNull();
  });

  it("labels the persona as AI and shows their role, company type and personality", () => {
    render(
      <PersonaCard
        persona={{
          personaName: "Maya Chen",
          personaTitle: "VP Operations",
          companyType: "Regional logistics company",
          personality: "Direct, time-pressed, open to good ideas",
        }}
      />,
    );
    const card = screen.getByRole("region", { name: "Maya Chen" });
    expect(within(card).getByText("AI practice partner")).toBeInTheDocument();
    expect(within(card).getByText("VP Operations")).toBeInTheDocument();
    expect(within(card).getByText("Regional logistics company")).toBeInTheDocument();
    const chips = within(within(card).getByRole("list", { name: "Personality" })).getAllByRole(
      "listitem",
    );
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "Direct",
      "Time-pressed",
      "Open to good ideas",
    ]);
  });
});

describe("TranscriptBubble", () => {
  it("names who spoke for screen readers", () => {
    render(
      <ul>
        <TranscriptBubble from="partner" speaker="Maya Chen" text="What do you have for me?" />
        <TranscriptBubble from="student" speaker="You" text="A faster way to plan routes." />
      </ul>,
    );
    const [partner, student] = screen.getAllByRole("listitem");
    expect(partner).toHaveTextContent("Maya Chen said: What do you have for me?");
    expect(student).toHaveTextContent("You said: A faster way to plan routes.");
  });
});

describe("scoreBand", () => {
  it.each([
    [0, "Needs work"],
    [49, "Needs work"],
    [50, "Developing"],
    [79, "Developing"],
    [80, "Strong"],
    [100, "Strong"],
  ])("puts %i in the %s band", (score, label) => {
    expect(scoreBand(score).label).toBe(label);
  });
});

describe("ScoreRing", () => {
  it("renders the final score and band on the server, before any script runs", () => {
    const html = renderToString(<ScoreRing score={82} />);
    expect(html).toContain(">82<");
    expect(html).toContain("Strong");
    expect(html).toContain('aria-label="Overall score: 82 out of 100, strong"');
  });

  it("shows the final score straight away when reduced motion is preferred", () => {
    stubReducedMotion(true);
    useFakeFrames();
    render(<ScoreRing score={64} />);
    expect(screen.getByRole("img", { name: "Overall score: 64 out of 100, developing" })).toBe(
      screen.getByRole("img"),
    );
    expect(screen.getByText("64")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText("64")).toBeInTheDocument();
  });

  it("keeps the final score when the ring is already on screen, so it never flickers to 0", () => {
    stubReducedMotion(false);
    useFakeFrames();
    const io = observeEntries();
    render(<ScoreRing score={91} />);
    act(() => {
      io.fire({ isIntersecting: true, top: 120 });
      vi.advanceTimersByTime(50);
    });
    expect(screen.getByTestId("score-value")).toHaveTextContent("91");
  });

  it("counts up from 0 when it starts off screen, once it scrolls in, keeping the label exact", () => {
    stubReducedMotion(false);
    useFakeFrames();
    const io = observeEntries();
    render(<ScoreRing score={91} />);
    expect(screen.getByTestId("score-value")).toHaveTextContent("91");
    act(() => {
      io.fire({ isIntersecting: false, top: 2400 });
    });
    expect(screen.getByTestId("score-value")).toHaveTextContent("0");
    act(() => {
      io.fire({ isIntersecting: true, top: 300 });
    });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    const midway = Number(screen.getByTestId("score-value").textContent);
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(91);
    expect(screen.getByRole("img")).toHaveAccessibleName("Overall score: 91 out of 100, strong");
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId("score-value")).toHaveTextContent("91");
  });
});

describe("RubricBar", () => {
  it("shows the score out of five, the justification, and the quoted evidence", () => {
    render(
      <RubricBar
        name="Objection handling"
        score={4}
        weighted
        justification="Acknowledged the cost concern and answered it with a pilot offer."
        evidence="What if we started with one depot for a month?"
      />,
    );
    expect(screen.getByRole("heading", { name: "Objection handling" })).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Objection handling: 4 out of 5" })).toHaveAttribute(
      "aria-valuenow",
      "4",
    );
    expect(screen.getByText("4/5")).toBeInTheDocument();
    expect(screen.getByText("Counts double")).toBeInTheDocument();
    expect(screen.getByText("What if we started with one depot for a month?")).toBeInTheDocument();
  });

  it("says so when there is no quote to show", () => {
    const { container } = render(
      <RubricBar
        name="Clarity"
        score={2}
        justification="The main point was hard to find."
        evidence={null}
      />,
    );
    expect(container.querySelector("blockquote")).toBeNull();
    expect(screen.getByText("No single line to quote")).toBeInTheDocument();
    expect(screen.queryByText("Counts double")).not.toBeInTheDocument();
  });
});
