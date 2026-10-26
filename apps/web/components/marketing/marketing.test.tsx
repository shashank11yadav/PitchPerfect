import { computeOverall, RUBRIC_DIMENSIONS, SKILLS } from "@pitchperfect/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Faq } from "./Faq";
import { LegalNotice } from "./LegalNotice";
import { PracticeRoomPreview } from "./PracticeRoomPreview";
import { DISCOVERY_MOMENT, SAMPLE_SCORECARD, SAMPLE_WEIGHTED } from "./sample-session";
import { StageShowcase } from "./SessionStages";
import { ScorecardPreview } from "./ScorecardPreview";
import { SkillCards } from "./SkillsList";

const items = [
  { question: "Is the partner a real person?", answer: "No. It is an AI practice partner." },
  { question: "Can I type instead of talking?", answer: "Yes, text mode is always available." },
];

describe("Faq", () => {
  it("shows each question and reveals its answer when opened", async () => {
    render(<Faq heading="Questions" items={items} />);
    expect(screen.getByRole("heading", { level: 2, name: "Questions" })).toBeInTheDocument();
    const answer = screen.getByText("No. It is an AI practice partner.");
    expect(answer).not.toBeVisible();

    await userEvent.click(screen.getByText("Is the partner a real person?"));
    expect(answer).toBeVisible();
    expect(screen.getByText("Yes, text mode is always available.")).not.toBeVisible();

    await userEvent.click(screen.getByText("Is the partner a real person?"));
    expect(answer).not.toBeVisible();
  });

  // Enter and Space toggle a focused <summary> natively; jsdom doesn't emulate that, so the
  // behaviour is the browser's own. Here: each question is reachable by Tab.
  it("puts each question in the tab order", async () => {
    render(<Faq heading="Questions" items={items} />);
    await userEvent.tab();
    expect(screen.getByText("Is the partner a real person?").closest("summary")).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByText("Can I type instead of talking?").closest("summary")).toHaveFocus();
  });
});

describe("LegalNotice", () => {
  it("says the page is a demo template", () => {
    render(<LegalNotice />);
    expect(screen.getByRole("note")).toHaveTextContent("Demo template — not legal advice.");
  });
});

describe("ScorecardPreview", () => {
  it("shows an overall score computed from its own rubric, with all seven dimensions", () => {
    render(<ScorecardPreview />);
    const overall = computeOverall(SAMPLE_SCORECARD.dimensions, SAMPLE_WEIGHTED);
    expect(SAMPLE_SCORECARD.overall).toBe(overall);
    expect(
      screen.getByRole("img", { name: new RegExp(`^Overall score: ${String(overall)} `) }),
    ).toBeInTheDocument();
    for (const { key, name } of RUBRIC_DIMENSIONS) {
      const score = SAMPLE_SCORECARD.dimensions.find((dimension) => dimension.key === key)?.score;
      expect(
        screen.getByRole("meter", { name: `${name}: ${String(score)} out of 5` }),
      ).toBeInTheDocument();
    }
  });

  it("only quotes words the student actually said in the sample transcript", () => {
    const quotes = [
      ...SAMPLE_SCORECARD.dimensions.flatMap((d) => (d.evidence ? [d.evidence] : [])),
      SAMPLE_SCORECARD.strongerLine.original,
    ];
    render(<PracticeRoomPreview />);
    const transcript = screen.getByRole("list", { name: "Transcript" });
    const studentWords = within(transcript)
      .getAllByRole("listitem")
      .filter((item) => item.textContent.startsWith("You said"))
      .map((item) => item.textContent)
      .join(" ");
    for (const quote of quotes) expect(studentWords).toContain(quote);
  });
});

describe("PracticeRoomPreview", () => {
  it("labels the buyer as a sample, not as AI, and shows the conversation stage", () => {
    render(<PracticeRoomPreview />);
    expect(screen.getByText("Sample buyer")).toBeInTheDocument();
    expect(screen.queryByText("AI practice partner")).toBeNull();
    expect(screen.getByRole("list", { name: "Conversation stages" })).toBeInTheDocument();
    expect(screen.getByText("Objection").closest("li")).toHaveAttribute("aria-current", "step");
  });
});

describe("PracticeRoomPreview moments", () => {
  it("shows the buyer, stage and turns of the moment it is given", () => {
    render(<PracticeRoomPreview moment={DISCOVERY_MOMENT} />);
    expect(screen.getByRole("region", { name: "Daniel Brooks" })).toBeInTheDocument();
    expect(screen.getByText("Discovery").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("18 turns left")).toBeInTheDocument();
    expect(screen.queryByText(/Maya/)).not.toBeInTheDocument();
  });
});

describe("StageShowcase", () => {
  it("puts its heading before the stage list, so the outline reads in order", () => {
    render(
      <StageShowcase title="A call that moves like a real one" moment={DISCOVERY_MOMENT}>
        <p>Facts</p>
      </StageShowcase>,
    );
    const heading = screen.getByRole("heading", { level: 2 });
    const stages = screen.getByRole("list", { name: "The five stages of a call" });
    expect(heading.compareDocumentPosition(stages) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(stages).getByText("Discovery")).toHaveAttribute("aria-current", "step");
  });
});

describe("SkillCards", () => {
  it("gives every shared skill its own card, with its name as a heading and its summary", () => {
    render(<SkillCards />);
    const section = screen.getByRole("region", { name: "Eight skills to practice" });
    const cards = within(section).getAllByRole("listitem");
    expect(
      cards.map((card) => within(card).getByRole("heading", { level: 3 }).textContent),
    ).toEqual(SKILLS.map((skill) => skill.title));
    expect(cards.map((card) => card.textContent)).toEqual(
      SKILLS.map((skill) => `${skill.title}${skill.summary}`),
    );
  });
});
