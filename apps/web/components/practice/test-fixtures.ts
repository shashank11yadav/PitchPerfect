import type { AttemptView, Scorecard } from "@pitchperfect/shared";

/** A fictional finished pitching call with a full scorecard (overall computed from the scores). */
export const SCORECARD: Scorecard = {
  overall: 72,
  dimensions: [
    {
      key: "clarity",
      score: 4,
      justification: "Each turn made one point.",
      evidence: "I can save your dispatchers an hour a day.",
    },
    {
      key: "value",
      score: 5,
      justification: "Tied the hour saved to the overtime Dana mentioned.",
      evidence: "That hour is the overtime you told me about.",
    },
    {
      key: "structure",
      score: 3,
      justification: "Good opening, but the pitch came before the problem was clear.",
      evidence: null,
    },
    {
      key: "discovery",
      score: 3,
      justification: "One open question, no follow-up on impact.",
      evidence: "How do you plan loads today?",
    },
    {
      key: "objections",
      score: 4,
      justification: "Acknowledged the cost worry and offered a pilot.",
      evidence: "That’s fair. What if we tried one lane for a month?",
    },
    {
      key: "confidence",
      score: 4,
      justification: "Calm and short, no filler.",
      evidence: null,
    },
    {
      key: "cta",
      score: 3,
      justification: "Asked for a pilot without a date.",
      evidence: "What if we tried one lane for a month?",
    },
  ],
  strengths: [
    "Opened with the buyer’s problem, not the product.",
    "Kept every turn short.",
    "Answered the price worry with a small first step.",
  ],
  improvements: [
    "Ask how often loads get replanned before pitching.",
    "Put a date on the pilot.",
    "Name who else needs to agree.",
  ],
  strongerLine: {
    original: "What if we tried one lane for a month?",
    improved: "Could we run one lane for four weeks starting the 3rd, and review it together?",
  },
};

export function completedAttempt(overrides: Partial<AttemptView> = {}): AttemptView {
  return {
    id: "65f1c0ffee00000000000b01",
    skill: "pitching",
    jobId: null,
    status: "completed",
    stage: "close",
    scenarioPublic: {
      personaName: "Dana Ruiz",
      personaTitle: "Operations director",
      companyType: "Regional freight broker",
      personality: "Busy, skeptical",
      openingLine: "You have two minutes. What is this about?",
    },
    transcript: [
      { role: "student", text: "I can save your dispatchers an hour a day." },
      { role: "partner", text: "An hour? Doing what, exactly?" },
    ],
    scorecard: SCORECARD,
    startedAt: "2026-10-19T15:00:00.000Z",
    endedAt: "2026-10-19T15:12:00.000Z",
    expiresAt: "2027-04-17T15:00:00.000Z",
    ...overrides,
  };
}
