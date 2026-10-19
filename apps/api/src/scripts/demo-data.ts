import {
  computeOverall,
  getSkill,
  ScorecardSchema,
  type RubricKey,
  type Scorecard,
  type SkillSlug,
} from "@pitchperfect/shared";
import { description, hourly, salary, type SeedCompany, type SeedJob } from "./seed-data.js";

/** Demo accounts, created only by `seed --demo`. Fictional people on a reserved domain. */

export const DEMO_STUDENT_EMAIL = "student@pitchperfect.example";
export const DEMO_EMPLOYER_EMAIL = "employer@pitchperfect.example";

export const DEMO_STUDENT = {
  name: { first: "Riley", last: "Hartwell" },
  profile: {
    school: "Lakeview State University",
    major: "Marketing",
    targetRole: "Sales development representative",
    industry: "Software",
    state: "MA",
    lessonsCompleted: ["introducing-yourself", "pitching", "objection-handling"],
  },
} as const;

export const DEMO_EMPLOYER_NAME = { first: "Morgan", last: "Ellis" } as const;

/** The demo employer's own company, so signing in as them shows real applicants. */
export const DEMO_COMPANY: SeedCompany = {
  name: "Pitchwell Demo Hiring Co",
  host: "pitchwell-demo.example",
  pitch: "A made-up company for trying out PitchPerfect as an employer.",
  verification: "verified",
  employer: { ...DEMO_EMPLOYER_NAME, jobTitle: "Head of talent" },
};

/** Its two open roles. `company` is 0, the only company in this list. */
export const DEMO_JOBS: readonly SeedJob[] = [
  {
    company: 0,
    title: "Sales development representative",
    location: "Remote, US",
    workplace: "remote",
    employmentType: "full_time",
    descriptionHtml: description(
      "Open conversations with operations teams and book demos for the sales lead.",
      [
        "Write short, personal outreach to new prospects",
        "Run first calls and note what each buyer cares about",
        "Hand warm leads to the sales lead with clear notes",
      ],
      "A friendly, made-up role for exploring how employers review applicants.",
    ),
    skills: ["Cold outreach", "Discovery questions", "Follow-up"],
    pay: salary(50_000, 58_000, true),
    status: "active",
  },
  {
    company: 0,
    title: "Sales operations intern",
    location: "Remote, US",
    workplace: "remote",
    employmentType: "internship",
    descriptionHtml: description(
      "Help the team keep its lead lists and weekly reports in good shape.",
      [
        "Clean up lead records and remove duplicates",
        "Build a simple weekly pipeline report",
        "Suggest one small process fix each month",
      ],
      "A made-up internship for exploring how employers post and manage jobs.",
    ),
    skills: ["Spreadsheets", "Attention to detail", "Reporting"],
    pay: hourly(17, 20),
    status: "active",
  },
];

/** The demo student applies to the first of `DEMO_JOBS` and shares the first attempt. */

type Score = 1 | 2 | 3 | 4 | 5;
type Dimension = readonly [
  key: RubricKey,
  score: Score,
  justification: string,
  evidence: string | null,
];

export interface DemoAttempt {
  /** Fixed, so re-running the seed finds the attempt instead of adding another. */
  id: string;
  skill: SkillSlug;
  /** Index into `DEMO_JOBS` when the session was practiced for a job. */
  job?: number;
  daysAgo: number;
  scenarioPublic: {
    personaName: string;
    personaTitle: string;
    companyType: string;
    personality: string;
    openingLine: string;
  };
  scenarioPrivate: { hiddenObjections: string[]; winConditions: string[] };
  /** Alternating turns, starting with the partner's opening line. */
  turns: readonly string[];
  tokens: { input: number; output: number };
  dimensions: readonly Dimension[];
  strengths: readonly [string, string, string];
  improvements: readonly [string, string, string];
  strongerLine: { original: string; improved: string };
}

export const DEMO_ATTEMPTS: readonly DemoAttempt[] = [
  {
    id: "5eed0000000000000000a001",
    skill: "pitching",
    job: 0,
    daysAgo: 4,
    scenarioPublic: {
      personaName: "Marcus Bell",
      personaTitle: "Operations director",
      companyType: "Regional logistics company",
      personality: "Busy and direct; warms up when the pitch ties to a real cost",
      openingLine:
        "Marcus Bell. I have about five minutes before my next call, so what is this about?",
    },
    scenarioPrivate: {
      hiddenObjections: [
        "Budgets are tight this year",
        "Another tool nobody opens would be a waste",
      ],
      winConditions: ["Student ties the product to a cost the buyer names"],
    },
    turns: [
      "Marcus Bell. I have about five minutes before my next call, so what is this about?",
      "Thanks for taking the time, Marcus. I'm Riley, and I help operations teams spot late shipments before customers call about them. How do you track delays today?",
      "Spreadsheets and a lot of phone calls to drivers. It works, mostly. What are you selling?",
      "A dashboard that pulls delivery data onto one screen and flags late loads early. How much time does your team spend each week chasing status updates?",
      "Probably fifteen hours across dispatch, and everyone complains about it. But budgets are tight and I do not want another tool nobody opens.",
      "That makes sense. If we cut those fifteen hours in half, your dispatchers get back a full day a week, and our team handles setup so nobody learns a new system alone. Could we run a pilot on one lane and meet Thursday at 10 to plan it?",
      "A one-lane pilot I can consider. Thursday at ten works, send the details first and I will bring my dispatch lead.",
    ],
    tokens: { input: 1_480, output: 530 },
    dimensions: [
      [
        "clarity",
        4,
        "Your opening said who you help and what changes for them in one sentence.",
        "I help operations teams spot late shipments before customers call about them",
      ],
      [
        "value",
        4,
        "You tied the benefit to the fifteen hours Marcus mentioned instead of listing features.",
        "your dispatchers get back a full day a week",
      ],
      [
        "structure",
        3,
        "Clear opening and close, but the middle moved from questions to pitch quickly.",
        "Thanks for taking the time, Marcus",
      ],
      [
        "discovery",
        4,
        "A useful question that surfaced a real cost; one more follow-up on impact would help.",
        "How much time does your team spend each week chasing status updates?",
      ],
      [
        "objections",
        3,
        "You acknowledged the budget worry but answered it with setup help, not evidence.",
        "That makes sense.",
      ],
      [
        "confidence",
        4,
        "Assured and concise, with no filler or apologies.",
        "our team handles setup so nobody learns a new system alone",
      ],
      [
        "cta",
        5,
        "A specific, time-bound next step that fits the buyer's stated risk.",
        "Could we run a pilot on one lane and meet Thursday at 10 to plan it?",
      ],
    ],
    strengths: [
      "You connected the product to a cost the buyer named: fifteen hours a week.",
      "You asked an open question about how delays are tracked today.",
      "You closed with a specific day and time for a pilot planning call.",
    ],
    improvements: [
      "Ask one more question about what a late load costs before you describe the dashboard.",
      "When the buyer raised budget, offer a proof point such as a similar customer's result.",
      "Summarize what you heard before pitching so the buyer feels understood.",
    ],
    strongerLine: {
      original: "A dashboard that pulls delivery data onto one screen and flags late loads early.",
      improved:
        "Dispatch teams use our dashboard to see late loads before a customer calls, which usually frees up a day of phone calls each week.",
    },
  },
  {
    id: "5eed0000000000000000a002",
    skill: "objection-handling",
    daysAgo: 1,
    scenarioPublic: {
      personaName: "Elena Cho",
      personaTitle: "Finance manager",
      companyType: "Regional property management group",
      personality: "Skeptical; cares about price and the risk of switching",
      openingLine:
        "Elena Cho here. We already have a vendor for this, and honestly your price looks high. Convince me to keep listening.",
    },
    scenarioPrivate: {
      hiddenObjections: [
        "A migration would take time I do not have",
        "I want proof from a company my size",
        "The price is above this year's budget",
      ],
      winConditions: [
        "Student acknowledges the objection before responding",
        "Student offers evidence or a low-risk trial",
      ],
    },
    turns: [
      "Elena Cho here. We already have a vendor for this, and honestly your price looks high. Convince me to keep listening.",
      "I appreciate you being direct, Elena. Before I say anything about price, what does your current vendor do well, and where does it fall short?",
      "They are reliable, but reporting is slow and every change request takes weeks. Still, switching means migration work I do not have time for.",
      "So the real concern is the time a migration would take, not only the cost. Is that fair?",
      "Yes, that is the bigger worry. And I would want to hear from a company my size that made the switch.",
      "Fair ask. A property group with about two hundred units moved over in three weeks with our team doing the data transfer, and I can introduce you to their manager. Would a call with them this week help?",
      "That would help. Set it up for Wednesday afternoon and I will decide on a trial after that.",
    ],
    tokens: { input: 1_390, output: 495 },
    dimensions: [
      [
        "clarity",
        4,
        "You restated the buyer's concern in one clear sentence.",
        "So the real concern is the time a migration would take, not only the cost.",
      ],
      [
        "value",
        3,
        "Benefits stayed general; the slow reporting Elena mentioned was not used.",
        null,
      ],
      [
        "structure",
        3,
        "Good flow from question to restatement to proof, with a loose ending.",
        "Is that fair?",
      ],
      [
        "discovery",
        4,
        "You asked about strengths and gaps before defending your price.",
        "what does your current vendor do well, and where does it fall short?",
      ],
      [
        "objections",
        5,
        "You acknowledged, clarified the real worry, answered with evidence, and checked.",
        "I can introduce you to their manager.",
      ],
      [
        "confidence",
        4,
        "Calm and positive when the buyer was blunt about price.",
        "I appreciate you being direct, Elena.",
      ],
      [
        "cta",
        3,
        "A clear ask, but this week leaves the day open; name a day and time.",
        "Would a call with them this week help?",
      ],
    ],
    strengths: [
      "You asked what the current vendor does well before defending your price.",
      "You restated the buyer's real concern and checked it with a question.",
      "You answered the switching worry with a concrete reference and an introduction.",
    ],
    improvements: [
      "Name a specific day and time when you ask for the next step.",
      "Use the slow reporting Elena mentioned to show what your product does better.",
      "Compare the price gap with the time her team loses on change requests.",
    ],
    strongerLine: {
      original: "Would a call with them this week help?",
      improved:
        "Could I set up a call with their manager for Wednesday at 2 p.m. so you can ask about the migration directly?",
    },
  },
];

/** The attempt's scorecard, with `overall` computed the same way the real scorer does it. */
export function scorecardFor(attempt: DemoAttempt): Scorecard {
  const dimensions = attempt.dimensions.map(([key, score, justification, evidence]) => ({
    key,
    score,
    justification,
    evidence,
  }));
  return ScorecardSchema.parse({
    overall: computeOverall(dimensions, getSkill(attempt.skill).weighted),
    dimensions,
    strengths: attempt.strengths,
    improvements: attempt.improvements,
    strongerLine: attempt.strongerLine,
  });
}
