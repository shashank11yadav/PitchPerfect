import {
  computeOverall,
  LIMITS,
  type RubricKey,
  type ScenarioPublic,
  type Scorecard,
  type Stage,
  type TranscriptRole,
} from "@pitchperfect/shared";

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

type Persona = Pick<ScenarioPublic, "personaName" | "personaTitle" | "companyType" | "personality">;

interface TranscriptLine {
  role: TranscriptRole;
  text: string;
}

/** One moment in a practice room: who the buyer is, where the call is, and what was said. */
export interface RoomMoment {
  persona: Persona;
  skillTitle: string;
  stage: Stage;
  timeLeft: string;
  transcript: readonly TranscriptLine[];
  /** The partner's next reply, shown arriving as a streamed reply. */
  streamedReply: string;
}

/** Turns left, from the shared cap and the student's turns so far. */
export const turnsLeft = ({ transcript }: Pick<RoomMoment, "transcript">) =>
  LIMITS.maxStudentTurns - transcript.filter((line) => line.role === "student").length;

const [opener, firstQuestion, firstAnswer] = SAMPLE_TRANSCRIPT;

/** Late in Maya's call: her objection, and the pilot the student offers. Used on the home page. */
export const OBJECTION_MOMENT: RoomMoment = {
  persona: SAMPLE_PERSONA,
  skillTitle: SAMPLE_SKILL_TITLE,
  stage: "objection",
  timeLeft: "14:20",
  transcript: SAMPLE_TRANSCRIPT,
  streamedReply:
    "One depot I could probably sell upstairs. Who on my side would have to set it up?",
};

/** The same call two minutes in, at the first discovery question. Used on how it works. */
export const EARLY_MOMENT: RoomMoment = {
  persona: SAMPLE_PERSONA,
  skillTitle: SAMPLE_SKILL_TITLE,
  stage: "discovery",
  timeLeft: "18:05",
  transcript: [opener, firstQuestion],
  streamedReply: firstAnswer.text,
};

/** A different buyer and skill: discovery with a vague, friendly owner. Used on the students page. */
export const DISCOVERY_MOMENT: RoomMoment = {
  persona: {
    personaName: "Daniel Brooks",
    personaTitle: "Operations manager",
    companyType: "Family-owned heating and cooling company",
    personality: "Friendly, vague, busy",
  },
  skillTitle: "Probing & discovery",
  stage: "discovery",
  timeLeft: "16:40",
  transcript: [
    {
      role: "partner",
      text: "We're doing fine, honestly. What did you want to talk about?",
    },
    {
      role: "student",
      text: "Thanks, Daniel. When a technician's job runs long, what happens to the rest of their day?",
    },
    {
      role: "partner",
      text: "The office calls the next customers and pushes them back. Some days that's the whole afternoon.",
    },
    {
      role: "student",
      text: "How often does that happen in a normal week?",
    },
  ],
  streamedReply: "Most weeks? Three or four days. Fridays are the worst.",
};

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
    evidence: "Thanks for making time, Maya. Before I pitch anything",
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
    evidence: "and you only continue if your dispatchers actually use it",
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
