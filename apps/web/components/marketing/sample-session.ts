import { computeOverall, type RubricKey, type Scorecard, type Stage } from "@pitchperfect/shared";

/**
 * One fictional practice session shown on the marketing pages: an objection-handling practice
 * with an invented buyer. The scorecard's quotes are taken word for word from the transcript.
 */
export const SAMPLE_PERSONA = {
  personaName: "Maya Chen",
  personaTitle: "VP Operations",
  companyType: "Regional logistics company",
  personality: "Direct, time-pressed, open to good ideas",
};

export const SAMPLE_SKILL_TITLE = "Objection handling";
export const SAMPLE_WEIGHTED: RubricKey = "objections";
export const SAMPLE_STAGE: Stage = "objection";
export const SAMPLE_TURNS_LEFT = 17;
export const SAMPLE_TIME_LEFT = "14:20";

export const SAMPLE_TRANSCRIPT = [
  {
    role: "partner",
    text: "I've got about ten minutes before a carrier call. What are you here to show me?",
  },
  {
    role: "student",
    text: "Thanks for making time, Maya. Before I pitch anything, how are your dispatchers planning routes today?",
  },
  {
    role: "partner",
    text: "Spreadsheets, mostly, and a lot of phone calls when a driver calls in sick. It works, just not quickly.",
  },
  {
    role: "student",
    text: "Our planner rebuilds the day's routes in minutes when someone is out, so dispatch stops firefighting.",
  },
  {
    role: "partner",
    text: "We tried a routing tool two years ago. It cost a fortune and my team never used it.",
  },
  {
    role: "student",
    text: "That's fair, and I'd be skeptical too. What if we started with one depot for a month, and you only continue if your dispatchers actually use it?",
  },
] as const;

const dimensions: Scorecard["dimensions"] = [
  {
    key: "clarity",
    score: 4,
    justification: "Each turn made one point, and the pitch fit in a single sentence.",
    evidence: "Our planner rebuilds the day's routes in minutes when someone is out",
  },
  {
    key: "value",
    score: 4,
    justification: "Tied the product to the sick-day scramble Maya described, not to features.",
    evidence: "so dispatch stops firefighting",
  },
  {
    key: "structure",
    score: 3,
    justification:
      "A strong opening question, but the pitch came before the cost of the problem was clear.",
    evidence: null,
  },
  {
    key: "discovery",
    score: 3,
    justification:
      "One good open question. A follow-up on how often routes break would have shown the impact.",
    evidence: "how are your dispatchers planning routes today?",
  },
  {
    key: "objections",
    score: 4,
    justification: "Acknowledged the bad past experience, then answered it with a low-risk pilot.",
    evidence: "That's fair, and I'd be skeptical too.",
  },
  {
    key: "confidence",
    score: 4,
    justification: "Calm and concise throughout, with no filler or apologies.",
    evidence: null,
  },
  {
    key: "cta",
    score: 3,
    justification: "Offered a pilot, but without a start date or a next meeting.",
    evidence: "What if we started with one depot for a month",
  },
];

export const SAMPLE_SCORECARD: Scorecard = {
  overall: computeOverall(dimensions, SAMPLE_WEIGHTED),
  dimensions,
  strengths: [
    "Asked how routes are planned today before pitching anything.",
    "Linked the product to the problem Maya described in her own words.",
    "Agreed with the objection before answering it, which kept the conversation open.",
  ],
  improvements: [
    "Ask how often routes break and what that costs before you pitch.",
    "Put a date on the pilot: propose a start week and a review call.",
    "Back the pilot with one concrete result you could measure together.",
  ],
  strongerLine: {
    original:
      "What if we started with one depot for a month, and you only continue if your dispatchers actually use it?",
    improved:
      "Could we start one depot on a 30-day pilot next Monday, and book 20 minutes at the end of the month to review usage with your dispatch lead?",
  },
};
