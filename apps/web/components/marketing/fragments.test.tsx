import { redactPii } from "@pitchperfect/shared";
import { SEED_COMPANIES, SEED_JOBS } from "@pitchperfect/shared/seed-data";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApplicantsPreview, EMPLOYER_PIPELINE } from "./ApplicantsPreview";
import {
  ApplyFragment,
  InviteFragment,
  JobPostFragment,
  JobPracticeFragment,
  ListingsFragment,
  RedactionFragment,
  ScoredLineFragment,
} from "./fragments";
import { DISCOVERY_MOMENT } from "./sample-session";

/** Title and company of every active job on the seeded board. */
const BOARD = SEED_JOBS.filter((job) => job.status === "active").map((job) => ({
  title: job.title,
  company: SEED_COMPANIES[job.company]?.name ?? "",
}));

describe("the sample jobs on the public pages", () => {
  it("are jobs on the seeded board, shown with their company", () => {
    const { container } = render(
      <>
        <ApplyFragment />
        <JobPracticeFragment />
        <ApplicantsPreview />
        <ApplicantsPreview pipeline={EMPLOYER_PIPELINE} />
      </>,
    );
    render(<ListingsFragment />);
    const pictures = [
      ...container.querySelectorAll("[data-ui]"),
      ...screen.getAllByRole("listitem").filter((item) => item.closest("ul[data-ui]")),
    ];
    expect(pictures).toHaveLength(6);
    for (const picture of pictures) {
      const text = picture.textContent;
      const onBoard = BOARD.some((job) => text.includes(job.title) && text.includes(job.company));
      expect(onBoard, text).toBe(true);
    }
  });

  it("show the hiring job's real pay, place and skills in the job post", () => {
    render(<JobPostFragment />);
    const seeded = SEED_JOBS.find(
      (job) =>
        job.title === "Sales development representative" &&
        SEED_COMPANIES[job.company]?.name === "Zentrova Analytics",
    );
    expect(screen.getByText("$52,000–$60,000 per year + commission")).toBeInTheDocument();
    expect(screen.getByText("Boston, MA (hybrid)")).toBeInTheDocument();
    const skills = within(screen.getByRole("list", { name: "Skills" })).getAllByRole("listitem");
    expect(skills.map((skill) => skill.textContent)).toEqual(seeded?.skills);
  });

  it("name the same job in the invite as in the employers page applicants", () => {
    render(<InviteFragment />);
    expect(screen.getByText(EMPLOYER_PIPELINE.job.title)).toBeInTheDocument();
    expect(screen.getByText("meet.example/zentrova-analytics-sdr")).toBeInTheDocument();
  });
});

describe("ApplicantsPreview", () => {
  it("shows a dash, labelled for screen readers, for an applicant with no scorecard", () => {
    render(<ApplicantsPreview />);
    const empty = screen.getByRole("img", { name: "No scorecard shared" });
    expect(empty).toHaveTextContent("—");
    expect(screen.queryByText("None")).not.toBeInTheDocument();
  });
});

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
