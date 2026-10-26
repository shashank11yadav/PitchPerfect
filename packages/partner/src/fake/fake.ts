import {
  SKILLS,
  type ScenarioPrivate,
  type ScenarioPublic,
  type SkillSlug,
} from "@pitchperfect/shared";
import { mulberry32 } from "./fake-patterns.js";
import { personaReply } from "./fake-persona.js";
import { heuristicScorecard } from "./fake-scorecard.js";
import {
  type ChatMessage,
  type ChatStreamInput,
  type LlmProvider,
  type ProviderTask,
  type StructuredInput,
  type Usage,
  type UsageMeter,
  abortedBy,
  parseStructured,
  taskOf,
} from "../provider.js";

type Override = (input: { system: string; messages: ChatMessage[] }) => string | object;

export interface FakeProviderOptions {
  seed?: number;
  /** Replace the scripted output for a task. Structured results are still validated. */
  overrides?: Partial<Record<ProviderTask, Override>>;
}

const DEFAULT_SEED = 1;
const STREAM_CHUNKS = 4;

/** Seeded from the provider seed and a per-call salt. */
const random = (seed: number, salt: number) =>
  mulberry32(Math.imul(seed, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b));

const pick = <T>(items: readonly T[], next: () => number): T =>
  items[Math.floor(next() * items.length)] as T;

interface Cast {
  personas: readonly {
    personaName: string;
    personaTitle: string;
    personality: string;
    companyType: string;
  }[];
  objections: readonly string[];
  winConditions: readonly string[];
  opening: (firstName: string, fullName: string) => string;
}

/** Buyers, each in the trade their title belongs to. */
const BUYERS: Cast = {
  personas: [
    {
      personaName: "Maya Okonjo",
      personaTitle: "Operations manager",
      personality: "Busy and direct",
      companyType: "A 40-person regional logistics firm",
    },
    {
      personaName: "Daniel Reyes",
      personaTitle: "Head of finance",
      personality: "Skeptical, wants numbers",
      companyType: "A growing online furniture retailer",
    },
    {
      personaName: "Ruth Lindgren",
      personaTitle: "Clinic director",
      personality: "Warm but cautious",
      companyType: "A small chain of physical therapy clinics",
    },
    {
      personaName: "Sam Achterberg",
      personaTitle: "IT lead",
      personality: "Distracted, short on time",
      companyType: "A mid-sized group of dental clinics",
    },
  ],
  objections: [
    "The price is higher than what we pay today.",
    "We are mid-quarter and cannot take on a rollout now.",
    "We already use a tool that mostly works.",
    "I am not sure my team will adopt something new.",
    "I need sign-off from my manager before anything moves.",
  ],
  winConditions: [
    "The student asks about the current process before pitching.",
    "The student ties the offer to a problem the buyer mentioned.",
    "The student proposes a specific next meeting.",
  ],
  opening: (_first, full) => `Hi, this is ${full}. I have a few minutes. What can I do for you?`,
};

/** Introducing yourself: a hiring manager, not a buyer. */
const HIRING_MANAGERS: Cast = {
  personas: [
    {
      personaName: "Dana Whitfield",
      personaTitle: "Sales hiring manager",
      personality: "Friendly but probing",
      companyType: "A B2B software company hiring its first sales development reps",
    },
    {
      personaName: "Elena Brandt",
      personaTitle: "Head of sales development",
      personality: "Direct, short on time",
      companyType: "A logistics software company growing its sales team",
    },
  ],
  objections: [
    "You don't have direct sales experience yet.",
    "We usually hire people with a year of quota-carrying experience.",
    "I'm not sure why you want sales rather than marketing.",
  ],
  winConditions: [
    "The student opens with one clear point about themself.",
    "The student backs a claim with a specific result.",
    "The student asks a real question about the team.",
  ],
  opening: (first) =>
    `Hi, ${first} here. Thanks for reaching out. What did you want to talk about?`,
};

/** Referrals and networking: someone who knows the student and could make an introduction. */
const CONTACTS: Cast = {
  personas: [
    {
      personaName: "Tom Becker",
      personaTitle: "Your former internship manager",
      personality: "Warm but busy",
      companyType: "A regional marketing agency",
    },
    {
      personaName: "Lena Ortiz",
      personaTitle: "A family friend who works in sales",
      personality: "Helpful, a little cautious",
      companyType: "A payments company",
    },
  ],
  objections: [
    "I haven't talked to that person in a while.",
    "I'm not sure I know your work well enough to vouch for you.",
    "I don't want to put my name on an intro that goes nowhere.",
  ],
  winConditions: [
    "The student names the exact person they want to meet.",
    "The student offers to write the introduction themself.",
    "The student suggests a specific follow-up date.",
  ],
  opening: (first) => `Hey, good to hear from you. It's ${first}. What's up?`,
};

/** Who the student talks to for a skill. */
function castFor(skill: SkillSlug | undefined): Cast {
  if (skill === "introducing-yourself") return HIRING_MANAGERS;
  if (skill === "referrals-networking") return CONTACTS;
  return BUYERS;
}

const STUDENT_TURN = /<student_turn>([\s\S]*?)<\/student_turn>/g;

/** Student text inside `<student_turn>` blocks, or the user messages when there are none. */
function studentTurns(messages: readonly ChatMessage[]): string[] {
  const tagged = messages.flatMap((m) =>
    [...m.content.matchAll(STUDENT_TURN)].map((x) => x[1] ?? ""),
  );
  const turns = tagged.length
    ? tagged
    : messages.filter((m) => m.role === "user").map((m) => m.content);
  return turns.map((turn) => turn.trim()).filter(Boolean);
}

const estimateTokens = (text: string) => Math.ceil(text.length / 4);

function usageOf(input: { system: string; messages: ChatMessage[] }, output: string): Usage {
  const prompt = input.system + input.messages.map((m) => m.content).join("");
  return { inputTokens: estimateTokens(prompt), outputTokens: estimateTokens(output) };
}

/**
 * Deterministic stand-in for a real model: powers local dev without keys, tests, and e2e.
 * The task comes from the tag at the start of the system prompt.
 */
export class FakeProvider implements LlmProvider {
  readonly name = "fake";
  readonly #seed: number;
  readonly #overrides: FakeProviderOptions["overrides"];

  constructor({ seed = DEFAULT_SEED, overrides }: FakeProviderOptions = {}) {
    this.#seed = seed;
    this.#overrides = overrides;
  }

  async *chatStream(
    input: ChatStreamInput,
    signal: AbortSignal,
    meter?: UsageMeter,
  ): AsyncIterable<string> {
    const reply = this.#output(this.#task(input.system, ["turn"]), input);
    const text = typeof reply === "string" ? reply : JSON.stringify(reply);
    const words = text.split(/(?<=\s)/);
    const size = Math.ceil(words.length / STREAM_CHUNKS);
    for (let start = 0; start < words.length; start += size) {
      await Promise.resolve();
      if (signal.aborted) throw abortedBy(signal);
      yield words.slice(start, start + size).join("");
    }
    // Same contract as the real adapters: an abort after the last chunk is still an abort.
    if (signal.aborted) throw abortedBy(signal);
    meter?.add(usageOf(input, text));
  }

  structured<T>(input: StructuredInput<T>, signal: AbortSignal, meter?: UsageMeter): Promise<T> {
    if (signal.aborted) return Promise.reject(abortedBy(signal));
    try {
      const allowed = ["plan", "score", "guard", "moderate"] as const;
      const output = this.#output(this.#task(input.system, allowed), input);
      meter?.add(usageOf(input, typeof output === "string" ? output : JSON.stringify(output)));
      return Promise.resolve(parseStructured(output, input.schema));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  #task(system: string, allowed: readonly ProviderTask[]): ProviderTask {
    const task = taskOf(system);
    if (!task || !allowed.includes(task)) {
      throw new Error(
        `FakeProvider needs a system prompt starting with a task tag for ${allowed.join("/")}`,
      );
    }
    return task;
  }

  #output(task: ProviderTask, input: { system: string; messages: ChatMessage[] }): string | object {
    const override = this.#overrides?.[task];
    if (override) return override({ system: input.system, messages: input.messages });
    const turns = studentTurns(input.messages);
    switch (task) {
      case "plan": {
        const text = input.system + input.messages.map((m) => m.content).join(" ");
        const skill = SKILLS.find((candidate) => text.includes(`"${candidate.title}"`));
        return this.#plan(skill?.slug);
      }
      case "turn":
        return personaReply(this.#seed, input);
      case "score": {
        const text = input.system + input.messages.map((m) => m.content).join(" ");
        const skill = SKILLS.find((candidate) => text.includes(candidate.slug));
        return heuristicScorecard(turns, skill?.weighted ?? "clarity");
      }
      case "guard":
        return { category: "ok" };
      case "moderate":
        return { flagged: false };
    }
  }

  #plan(skill: SkillSlug | undefined): {
    scenarioPublic: ScenarioPublic;
    scenarioPrivate: ScenarioPrivate;
  } {
    const cast = castFor(skill);
    const next = random(this.#seed, 0);
    const { companyType, ...persona } = pick(cast.personas, next);
    const offset = Math.floor(next() * cast.objections.length);
    const count = next() < 0.5 ? 2 : 3;
    const firstName = persona.personaName.split(" ")[0] ?? persona.personaName;
    return {
      scenarioPublic: {
        ...persona,
        companyType,
        openingLine: cast.opening(firstName, persona.personaName),
      },
      scenarioPrivate: {
        hiddenObjections: Array.from(
          { length: count },
          (_, i) => cast.objections[(offset + i) % cast.objections.length] ?? "",
        ),
        winConditions: cast.winConditions.slice(
          0,
          1 + Math.floor(next() * cast.winConditions.length),
        ),
      },
    };
  }
}
