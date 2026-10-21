import { ScenarioPrivateSchema, ScenarioPublicSchema, ScorecardSchema } from "@pitchperfect/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  type ChatMessage,
  createUsageMeter,
  FakeProvider,
  ProviderError,
  stageTag,
  TASK_TAGS,
  type UsageMeter,
} from "./index.js";
import { dataBlock, scenarioBlock } from "../prompts/blocks.js";

const PlanSchema = z.strictObject({
  scenarioPublic: ScenarioPublicSchema,
  scenarioPrivate: ScenarioPrivateSchema,
});
const GuardSchema = z.strictObject({
  category: z.enum(["ok", "off_topic", "prompt_attack", "harmful"]),
});

const signal = () => new AbortController().signal;

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

/** Builds a conversation with `count` student turns, partner replies in between. */
function conversation(studentTurns: readonly string[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  studentTurns.forEach((turn, index) => {
    if (index > 0) messages.push({ role: "assistant", content: "Go on." });
    messages.push({ role: "user", content: `<student_turn>${turn}</student_turn>` });
  });
  return messages;
}

function turn(
  provider: FakeProvider,
  studentTurns: readonly string[],
  abortSignal = signal(),
  meter?: UsageMeter,
) {
  return provider.chatStream(
    {
      system: `${TASK_TAGS.turn} You are a buyer.`,
      messages: conversation(studentTurns),
      maxTokens: 200,
      temperature: 0.7,
    },
    abortSignal,
    meter,
  );
}

/** Reads a stream, aborting the controller once `abortAt` chunks have arrived. */
async function readThenAbort(
  stream: AsyncIterable<string>,
  controller: AbortController,
  abortAt: number,
  reason?: unknown,
) {
  const received: string[] = [];
  for await (const chunk of stream) {
    received.push(chunk);
    if (received.length === abortAt) controller.abort(reason);
  }
}

const SCENARIO = {
  scenarioPublic: {
    personaName: "Maya Okonjo",
    personaTitle: "Operations manager",
    companyType: "A 40-person regional logistics firm",
    personality: "Busy and direct",
    openingLine: "Hi, this is Maya Okonjo. I have a few minutes. What can I do for you?",
  },
  scenarioPrivate: {
    hiddenObjections: [
      "The price is higher than what we pay today.",
      "We are mid-quarter and cannot take on a rollout now.",
      "I need sign-off from my manager before anything moves.",
    ],
    winConditions: ["The student proposes a specific next meeting."],
  },
};

type Scenario = typeof SCENARIO;

/** A clinic buyer, the reviewer's probe scenario. */
const CLINIC: Scenario = {
  scenarioPublic: {
    personaName: "Ruth Lindgren",
    personaTitle: "Clinic director",
    companyType: "A mid-sized group of dental clinics",
    personality: "Warm but cautious",
    openingLine: "Hi, this is Ruth Lindgren. I have a few minutes. What can I do for you?",
  },
  scenarioPrivate: {
    hiddenObjections: [
      "We are mid-quarter and cannot take on a rollout now.",
      "We already use a tool that mostly works.",
    ],
    winConditions: ["The student proposes a specific next meeting."],
  },
};

/** A hiring manager, for introducing yourself. */
const HIRING: Scenario = {
  scenarioPublic: {
    personaName: "Priya Natarajan",
    personaTitle: "Sales hiring manager",
    companyType: "A B2B software company selling scheduling tools to clinics",
    personality: "Friendly but probing",
    openingLine: "Hi, Priya here. Thanks for reaching out. What did you want to talk about?",
  },
  scenarioPrivate: {
    hiddenObjections: [
      "You have no direct sales experience.",
      "We usually hire people with a year of quota-carrying experience.",
    ],
    winConditions: ["The student asks for a specific next step."],
  },
};

/** One line per kind of student turn the demo buyer tells apart. */
const INTENT_LINES = {
  identity: "Sorry, quick question first: are you a real person?",
  meeting: "Could we set up 20 minutes on Thursday at 10am with you and your dispatch lead?",
  process: "How do your dispatchers plan routes today?",
  quantity: "How much time does that take each morning?",
  cost: "What do you pay today, roughly?",
  decision: "Who else would need to sign off?",
  pitch:
    "Our planner rebuilds routes in minutes when a driver calls in sick, so your team saves hours.",
  acknowledge: "That's fair, I hear you.",
};

const TAG = /\s*\[\[stage:\w+\]\]$/;
const stageOf = (reply: string) => /\[\[stage:(\w+)\]\]$/.exec(reply)?.[1] ?? "none";

/** The buyer's reply, built the way the turn prompt sends it: the scenario, then the call. */
async function buyer(
  studentTurns: readonly string[],
  {
    stage,
    replies = [],
    lastTurn = false,
    seed = 1,
    scenario = SCENARIO,
  }: {
    stage?: string;
    replies?: readonly string[];
    lastTurn?: boolean;
    seed?: number;
    scenario?: Scenario;
  } = {},
): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: "user",
      content: `${scenarioBlock(scenario.scenarioPublic, scenario.scenarioPrivate)}\n\n(The call connects.)`,
    },
    { role: "assistant", content: scenario.scenarioPublic.openingLine },
  ];
  studentTurns.forEach((text, index) => {
    if (index > 0) {
      messages.push({ role: "assistant", content: replies[index - 1] ?? "Go on." });
    }
    messages.push({ role: "user", content: dataBlock("student_turn", text) });
  });
  const system = [
    `${TASK_TAGS.turn} You play the character.`,
    lastTurn
      ? "This is the student's final turn. Close the conversation naturally in this reply."
      : "",
    stage
      ? `The conversation is currently at the ${stage} stage; don't go back to earlier stages.`
      : "",
  ].join("\n");
  const stream = new FakeProvider({ seed }).chatStream(
    { system, messages, maxTokens: 200, temperature: 0.7 },
    signal(),
  );
  return (await collect(stream)).join("");
}

const plan = (provider: FakeProvider) =>
  provider.structured(
    {
      system: `${TASK_TAGS.plan} Build a scenario.`,
      messages: [{ role: "user", content: "skill: pitching" }],
      maxTokens: 600,
      schema: PlanSchema,
      schemaName: "scenario",
    },
    signal(),
  );

const STUDENT_TURNS = [
  "Hi, I'm Sam. I help small clinics cut their scheduling time.",
  "What does your current booking process look like? How many hours a week does it take?",
  "That makes sense, I hear you on price. Teams like yours usually save four hours a week.",
  "Could we book a demo next Tuesday at 2pm with your operations lead?",
];

function score(provider: FakeProvider, studentTurns: readonly string[] = STUDENT_TURNS) {
  const transcript = studentTurns
    .map((text) => `<student_turn>${text}</student_turn>\n<partner_turn>Okay.</partner_turn>`)
    .join("\n");
  return provider.structured(
    {
      system: `${TASK_TAGS.score} Score the transcript for the skill next-steps.`,
      messages: [{ role: "user", content: transcript }],
      maxTokens: 1200,
      schema: ScorecardSchema,
      schemaName: "scorecard",
    },
    signal(),
  );
}

describe("FakeProvider", () => {
  it("is named fake", () => {
    expect(new FakeProvider().name).toBe("fake");
  });

  describe("plan", () => {
    it("returns a valid scenario with 2-3 hidden objections", async () => {
      const result = await plan(new FakeProvider({ seed: 1 }));
      expect(PlanSchema.parse(result)).toEqual(result);
      expect(result.scenarioPrivate.hiddenObjections.length).toBeGreaterThanOrEqual(2);
      expect(result.scenarioPrivate.hiddenObjections.length).toBeLessThanOrEqual(3);
    });

    it("is identical across two runs with the same seed", async () => {
      expect(await plan(new FakeProvider({ seed: 42 }))).toEqual(
        await plan(new FakeProvider({ seed: 42 })),
      );
    });

    it.each([
      ["Introducing yourself", /hiring|sales|talent/i, /experience|quota|sales/i],
      ["Referrals & networking", /former|friend|colleague|mentor/i, /vouch|while|intro/i],
    ])("plays the right person for %s", async (title, persona, objection) => {
      const result = await new FakeProvider({ seed: 2 }).structured(
        {
          system: `${TASK_TAGS.plan} Build a scenario.`,
          messages: [{ role: "user", content: `Create the scenario for the skill "${title}".` }],
          maxTokens: 600,
          schema: PlanSchema,
          schemaName: "scenario",
        },
        signal(),
      );
      expect(result.scenarioPublic.personaTitle).toMatch(persona);
      expect(result.scenarioPrivate.hiddenObjections.join(" ")).toMatch(objection);
    });

    it("varies with the seed", async () => {
      const results = await Promise.all(
        [1, 2, 3, 4, 5].map((seed) => plan(new FakeProvider({ seed }))),
      );
      const names = new Set(results.map((result) => result.scenarioPublic.personaName));
      expect(names.size).toBeGreaterThan(1);
    });
  });

  describe("turn", () => {
    it("streams a reply in several chunks that ends with a stage tag", async () => {
      const chunks = await collect(turn(new FakeProvider(), ["Hello there."]));
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.join("").endsWith(` ${stageTag("discovery")}`)).toBe(true);
    });

    it("same input gives same output", async () => {
      const first = (await collect(turn(new FakeProvider({ seed: 9 }), ["One.", "Two."]))).join("");
      const again = (await collect(turn(new FakeProvider({ seed: 9 }), ["One.", "Two."]))).join("");
      expect(again).toBe(first);
    });

    it("stage never goes backwards", async () => {
      const stages = ["opening", "discovery", "pitch", "objection", "close"];
      for (const current of stages) {
        for (const line of Object.values(INTENT_LINES)) {
          const reply = await buyer([line], { stage: current });
          expect(stages.indexOf(stageOf(reply)), `${current}: ${line}`).toBeGreaterThanOrEqual(
            stages.indexOf(current),
          );
        }
      }
    });

    it.each([
      [
        "an identity question",
        INTENT_LINES.identity,
        /AI practice partner playing Maya/,
        "discovery",
      ],
      ["a meeting with a time", INTENT_LINES.meeting, /Thursday at 10am/i, "close"],
      ["a process question", INTENT_LINES.process, /driver|route|spreadsheet/i, "discovery"],
      [
        "a quantity question",
        INTENT_LINES.quantity,
        /\b(two|three|four|five|six|seven|\d+)\b/i,
        "discovery",
      ],
      ["a cost question", INTENT_LINES.cost, /\$\d/, "discovery"],
      ["a decision question", INTENT_LINES.decision, /sign[- ]off|manager/i, "discovery"],
      ["a pitch", INTENT_LINES.pitch, /mid-quarter|rollout/i, "objection"],
      [
        "an acknowledgement",
        INTENT_LINES.acknowledge,
        /example|company like ours|someone like us/i,
        "objection",
      ],
    ])("answers %s in kind", async (_name, line, expected, stage) => {
      const reply = await buyer([line], { stage: "discovery" });
      expect(reply).toMatch(expected);
      expect(stageOf(reply)).toBe(stage);
    });

    it("answers the question the student asked, not a word from the line before it", async () => {
      const reply = await buyer(
        [
          "I work with teams whose dispatchers spend hours a week on reroutes. How do your dispatchers plan routes today?",
        ],
        { stage: "discovery" },
      );
      expect(reply).not.toMatch(/\$\d/);
      expect(reply).toMatch(/driver|route|spreadsheet/i);
    });

    it("tells what the problem costs apart from what it pays today", async () => {
      const problem = await buyer(["What does one late delivery cost you?"], {
        stage: "discovery",
      });
      expect(problem).not.toMatch(/a month for what we use|finance would know/);
      expect(problem).toMatch(/\$\d|overtime|customer/i);
    });

    it("names who else is involved when asked who would want to see it", async () => {
      const reply = await buyer(
        [
          "That makes sense. If reroutes took minutes, who on your side would want to see that first?",
        ],
        { stage: "discovery" },
      );
      expect(reply).toMatch(/dispatch lead|manager/i);
    });

    it("says who owns the process when asked", async () => {
      const reply = await buyer(["Who owns that check right now?"], { stage: "discovery" });
      expect(reply).toMatch(/dispatch lead|manager/i);
    });

    const PROCESS_ANSWER = /front desk|calendar/i;
    const NOT_A_PROPOSAL = /what day|when, and who|works\. send|is packed/i;
    const OBJECTION = /mid-quarter|already use/i;

    // The reviewer's single-line probes, each from the opening of a call with a clinic buyer.
    it.each([
      ["How do patients book appointments today?", PROCESS_ANSWER, "not-close"],
      ["Let me introduce myself first. I'm Taylor from Brightdesk.", null, "not-close"],
      ["Should we start with how your front desk works?", PROCESS_ANSWER, "not-close"],
      ["how do you handle reminders today", PROCESS_ANSWER, "not-close"],
      ["walk me through your reminder process", PROCESS_ANSWER, "not-close"],
      ["What are you using today?", /booking system|practice software/i, "not-close"],
      ["Is this a real person I'm talking to?", /AI practice partner,? playing Ruth/, "opening"],
      ["Are you a person or a recording?", /AI practice partner,? playing Ruth/, "opening"],
      ["are you real", /AI practice partner/, "opening"],
      ["Am I talking to a bot?", /AI practice partner/, "opening"],
      ["Sorry, I can't help but notice you sound busy.", null, "not-close"],
      ["Thanks, that helps.", null, "not-close"],
      [
        "I'm a student at State. I'd like to learn how you run scheduling.",
        PROCESS_ANSWER,
        "not-close",
      ],
      ["Let's say a patient cancels at 8am. What happens?", PROCESS_ANSWER, "not-close"],
      ["Can we do this Wednesday?", /Wednesday/, "close"],
      ["How about Wednesday at 3pm?", /Wednesday at 3pm/, "close"],
      ["What does next week look like for you?", /Tuesday|Thursday|open/i, "close"],
      ["I'll follow up next week.", /^Next week (?:works|should work)/, "close"],
      ["Our reminders cut no-shows. Would a trial next month help?", /trial/i, "close"],
      [
        "Who decides on new software at your clinics?",
        /practice manager|decide|sign/i,
        "not-close",
      ],
      ["What's your budget for this?", /\$\d/, "not-close"],
      ["What do you pay for the reminder tool?", /\$\d/, "not-close"],
    ] as const)("hears %j for what it is", async (line, expected, stage) => {
      const reply = await buyer([line], { stage: "opening", scenario: CLINIC });
      if (expected) expect(reply).toMatch(expected);
      if (stage === "not-close") {
        expect(stageOf(reply)).not.toBe("close");
        expect(reply).not.toMatch(NOT_A_PROPOSAL);
      } else {
        expect(stageOf(reply)).toBe(stage);
      }
      if (!line.includes("cut no-shows")) expect(reply).not.toMatch(OBJECTION);
      expect(reply).not.toMatch(/make week work/);
    });

    it.each([
      "How do you schedule your drivers each morning?",
      "Hi Priya, let me introduce myself.",
      "How do patients book appointments today?",
    ])("doesn't take %j as a meeting request", async (line) => {
      const reply = await buyer([line], { stage: "opening" });
      expect(stageOf(reply)).not.toBe("close");
      expect(reply).not.toMatch(NOT_A_PROPOSAL);
    });

    it("takes a day in the answer to its own 'what day' as the proposal", async () => {
      const asked = await buyer(["Would you be open to a two-week pilot?"], { stage: "pitch" });
      expect(asked).toMatch(/what day|when/i);
      const reply = await buyer(
        ["Would you be open to a two-week pilot?", "Wednesday works, 3pm?"],
        {
          stage: "close",
          replies: [asked.replace(TAG, "")],
        },
      );
      expect(reply).toMatch(/Wednesday/);
      expect(reply).not.toMatch(/what day/i);
    });

    it("keeps the price worry back until money has come up", async () => {
      const priceFirst: Scenario = {
        ...CLINIC,
        scenarioPrivate: {
          ...CLINIC.scenarioPrivate,
          hiddenObjections: [
            "The price is higher than what we pay today.",
            "We already use a tool that mostly works.",
          ],
        },
      };
      const pitch = "Our reminders cut no-shows by a third.";
      const first = await buyer([pitch], { stage: "pitch", scenario: priceFirst });
      expect(first).toMatch(/already use/i);
      expect(first).not.toMatch(/price/i);
      const later = await buyer([pitch, "It costs less than one empty chair a month."], {
        stage: "objection",
        replies: [first.replace(TAG, "")],
        scenario: priceFirst,
      });
      expect(later).toMatch(/price/i);
    });

    it("talks like a hiring manager when the student introduces themself", async () => {
      const day = await buyer(["What does a typical day look like for an SDR on your team?"], {
        stage: "discovery",
        scenario: HIRING,
      });
      expect(day).toMatch(/outreach|calls|meetings/i);
      expect(day).not.toMatch(/front desk|patients/i);
      const record = await buyer(
        ["I ran our club's fundraising and booked 40 meetings with local businesses last spring."],
        { stage: "discovery", scenario: HIRING },
      );
      expect(record).toMatch(/sales experience|quota/i);
      expect(stageOf(record)).not.toBe("close");
      const who = await buyer(["Who else would I meet in the process?"], {
        stage: "discovery",
        scenario: HIRING,
      });
      expect(who).toMatch(/team lead|account executive/i);
    });

    it("raises the next hidden objection it hasn't raised yet", async () => {
      // Price waits until money comes up, so the first objection is the rollout.
      const first = await buyer([INTENT_LINES.pitch], { stage: "pitch" });
      expect(first).toMatch(/mid-quarter|rollout/i);
      const second = await buyer(
        [INTENT_LINES.pitch, "Our tool also cuts reporting time in half."],
        {
          stage: "objection",
          replies: [first],
        },
      );
      expect(second).toMatch(/sign-off|manager/i);
    });

    it("never repeats a line it already said in this call", async () => {
      const first = await buyer(["Okay."], { stage: "discovery" });
      const again = await buyer(["Okay.", "Okay."], { stage: "discovery", replies: [first] });
      expect(again.replace(TAG, "")).not.toBe(first.replace(TAG, ""));
    });

    it("closes the call on the student's last turn", async () => {
      const reply = await buyer(["Thanks for your time."], { stage: "pitch", lastTurn: true });
      expect(stageOf(reply)).toBe("close");
    });

    it("keeps replies within 80 words", async () => {
      for (let seed = 0; seed < 10; seed += 1) {
        for (let count = 1; count <= 5; count += 1) {
          const turns = Array.from({ length: count }, () => "Tell me more.");
          const text = (await collect(turn(new FakeProvider({ seed }), turns))).join("");
          expect(text.split(/\s+/).length).toBeLessThanOrEqual(80);
        }
      }
    });

    it("meters usage into the call's meter", async () => {
      const meter = createUsageMeter();
      await collect(turn(new FakeProvider(), ["Hello there."], signal(), meter));
      expect(meter.total().inputTokens).toBeGreaterThan(0);
      expect(meter.total().outputTokens).toBeGreaterThan(0);
    });

    it("meters concurrent calls into their own meters", async () => {
      const provider = new FakeProvider();
      const [short, long] = [createUsageMeter(), createUsageMeter()];
      await Promise.all([
        collect(turn(provider, ["Hi."], signal(), short)),
        collect(turn(provider, ["Hi.", "A much longer second turn ".repeat(20)], signal(), long)),
      ]);
      expect(long.total().inputTokens).toBeGreaterThan(short.total().inputTokens);
      const alone = createUsageMeter();
      await collect(turn(provider, ["Hi."], signal(), alone));
      expect(short.total()).toEqual(alone.total());
    });

    it("rejects as aborted when aborted mid-stream", async () => {
      const controller = new AbortController();
      const stream = turn(new FakeProvider(), ["Hi."], controller.signal);
      await expect(readThenAbort(stream, controller, 1)).rejects.toMatchObject({
        code: "aborted",
      });
    });

    it("rejects as aborted when aborted after the last chunk", async () => {
      const chunks = await collect(turn(new FakeProvider(), ["Hi."]));
      const controller = new AbortController();
      const stream = turn(new FakeProvider(), ["Hi."], controller.signal);
      await expect(readThenAbort(stream, controller, chunks.length)).rejects.toMatchObject({
        code: "aborted",
      });
    });

    it("maps a timed-out signal to a retryable timeout", async () => {
      const controller = new AbortController();
      const stream = turn(new FakeProvider(), ["Hi."], controller.signal);
      const reason = new DOMException("The operation timed out.", "TimeoutError");
      await expect(readThenAbort(stream, controller, 1, reason)).rejects.toMatchObject({
        code: "timeout",
        retryable: true,
      });
    });

    it("stops with an aborted error when the signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();
      const stream = new FakeProvider().chatStream(
        {
          system: `${TASK_TAGS.turn} buyer`,
          messages: conversation(["Hi."]),
          maxTokens: 200,
          temperature: 0.7,
        },
        controller.signal,
      );
      await expect(collect(stream)).rejects.toMatchObject({ code: "aborted" });
    });
  });

  describe("score", () => {
    it("returns a scorecard that passes ScorecardSchema", async () => {
      const result = await score(new FakeProvider());
      expect(ScorecardSchema.safeParse(result).success).toBe(true);
    });

    it("quotes only verbatim student text as evidence", async () => {
      const result = await score(new FakeProvider());
      for (const dimension of result.dimensions) {
        if (dimension.evidence !== null) {
          expect(STUDENT_TURNS.some((text) => text.includes(dimension.evidence ?? ""))).toBe(true);
        }
      }
      expect(STUDENT_TURNS.some((text) => text.includes(result.strongerLine.original))).toBe(true);
    });

    it("rewards questions, a dated ask, and penalises their absence", async () => {
      const strong = await score(new FakeProvider());
      const weak = await score(new FakeProvider(), ["Um, sorry, I just maybe sell software."]);
      const get = (card: typeof strong, key: string) =>
        card.dimensions.find((dimension) => dimension.key === key)?.score ?? 0;
      expect(get(strong, "discovery")).toBeGreaterThan(get(weak, "discovery"));
      expect(get(strong, "cta")).toBe(5);
      expect(get(weak, "cta")).toBe(1);
      expect(get(strong, "confidence")).toBeGreaterThan(get(weak, "confidence"));
      expect(weak.dimensions.find((dimension) => dimension.key === "cta")?.evidence).toBeNull();
    });

    it("is identical across two runs with the same seed", async () => {
      expect(await score(new FakeProvider({ seed: 5 }))).toEqual(
        await score(new FakeProvider({ seed: 5 })),
      );
    });
  });

  describe("guard and moderation", () => {
    it("classifies input as ok by default", async () => {
      const result = await new FakeProvider().structured(
        {
          system: `${TASK_TAGS.guard} classify`,
          messages: [{ role: "user", content: "<student_turn>Hi</student_turn>" }],
          maxTokens: 50,
          schema: GuardSchema,
          schemaName: "guard",
        },
        signal(),
      );
      expect(result).toEqual({ category: "ok" });
    });

    it("does not flag text by default", async () => {
      const provider = new FakeProvider();
      expect(await provider.moderate("anything", signal())).toEqual({ flagged: false });
    });
  });

  describe("overrides", () => {
    it("uses an override for its task and validates the result", async () => {
      const provider = new FakeProvider({
        overrides: { guard: () => ({ category: "prompt_attack" }) },
      });
      const result = await provider.structured(
        {
          system: `${TASK_TAGS.guard} classify`,
          messages: [],
          maxTokens: 50,
          schema: GuardSchema,
          schemaName: "guard",
        },
        signal(),
      );
      expect(result).toEqual({ category: "prompt_attack" });
    });

    it("surfaces an invalid override as invalid_structured_output", async () => {
      const provider = new FakeProvider({ overrides: { score: () => '{"overall": "high"}' } });
      const error: unknown = await score(provider).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ProviderError);
      expect(error).toMatchObject({ code: "invalid_structured_output", retryable: false });
    });

    it("surfaces a non-JSON override as invalid_structured_output", async () => {
      const provider = new FakeProvider({ overrides: { plan: () => "not json" } });
      await expect(plan(provider)).rejects.toMatchObject({ code: "invalid_structured_output" });
    });

    it("passes the system prompt and messages to a turn override", async () => {
      const provider = new FakeProvider({
        overrides: {
          turn: ({ messages }) => `You said ${String(messages.length)}. [[stage:pitch]]`,
        },
      });
      expect((await collect(turn(provider, ["Hi."]))).join("")).toBe("You said 1. [[stage:pitch]]");
    });

    it("lets moderation be overridden", async () => {
      const provider = new FakeProvider({ overrides: { moderate: () => ({ flagged: true }) } });
      expect(await provider.moderate("anything", signal())).toEqual({ flagged: true });
    });
  });

  it("rejects a system prompt without a task tag", async () => {
    await expect(
      new FakeProvider().structured(
        { system: "no tag", messages: [], maxTokens: 50, schema: GuardSchema, schemaName: "guard" },
        signal(),
      ),
    ).rejects.toThrow(/task tag/);
  });
});
