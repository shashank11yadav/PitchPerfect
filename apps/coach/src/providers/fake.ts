import { SKILLS, STAGES, type ScenarioPrivate, type ScenarioPublic } from "@pitchperfect/shared";
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
  stageTag,
  taskOf,
} from "./provider.js";

type OverrideKey = ProviderTask | "moderate";
type Override = (input: { system: string; messages: ChatMessage[] }) => string | object;

export interface FakeProviderOptions {
  seed?: number;
  /** Replace the scripted output for a task. Structured results are still validated. */
  overrides?: Partial<Record<OverrideKey, Override>>;
}

const DEFAULT_SEED = 1;
const STREAM_CHUNKS = 4;

/** Mulberry32, seeded from the provider seed and a per-call salt. */
function random(seed: number, salt: number): () => number {
  let state = (Math.imul(seed, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const pick = <T>(items: readonly T[], next: () => number): T =>
  items[Math.floor(next() * items.length)] as T;

const PERSONAS = [
  {
    personaName: "Maya Okonjo",
    personaTitle: "Operations manager",
    personality: "Busy and direct",
  },
  {
    personaName: "Daniel Reyes",
    personaTitle: "Head of finance",
    personality: "Skeptical, wants numbers",
  },
  {
    personaName: "Ruth Lindgren",
    personaTitle: "Clinic director",
    personality: "Warm but cautious",
  },
  {
    personaName: "Sam Achterberg",
    personaTitle: "IT lead",
    personality: "Distracted, short on time",
  },
] as const;

const COMPANY_TYPES = [
  "A 40-person regional logistics firm",
  "A mid-sized group of dental clinics",
  "A growing online furniture retailer",
  "A family-owned chain of hardware stores",
] as const;

const OBJECTIONS = [
  "The price is higher than what we pay today.",
  "We are mid-quarter and cannot take on a rollout now.",
  "We already use a tool that mostly works.",
  "I am not sure my team will adopt something new.",
  "I need sign-off from my manager before anything moves.",
] as const;

const WIN_CONDITIONS = [
  "The student asks about the current process before pitching.",
  "The student ties the offer to a problem the buyer mentioned.",
  "The student proposes a specific next meeting.",
] as const;

const REPLIES: Record<(typeof STAGES)[number], readonly string[]> = {
  opening: [
    "Let's back up a little. Remind me who you are and why you reached out?",
    "Sorry, I lost the thread there. What is this call about again?",
  ],
  discovery: [
    "Fair enough. Honestly, things work fine as they are. What makes you think we need anything?",
    "Okay. We're stretched thin this month, so what exactly do you want to know about how we work?",
  ],
  pitch: [
    "Alright, I'm listening. What would this actually change for a team like mine?",
    "That's a real headache for us, yes. So how would your offer help with it?",
  ],
  objection: [
    "I'll be honest, the price worries me. We already pay for a tool that mostly works, so why switch?",
    "My concern is timing. We're mid-quarter and my team can't take on a rollout. Why now?",
  ],
  close: [
    "That's helpful, thank you. If we did move ahead, what would the next step look like?",
    "You've made a decent case. What would you suggest we do from here?",
  ],
};

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
      const output = this.#output(this.#task(input.system, ["plan", "score", "guard"]), input);
      meter?.add(usageOf(input, typeof output === "string" ? output : JSON.stringify(output)));
      return Promise.resolve(parseStructured(output, input.schema));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** Like the OpenAI endpoint, moderation reports no token usage. */
  moderate(text: string, signal: AbortSignal): Promise<{ flagged: boolean }> {
    if (signal.aborted) return Promise.reject(abortedBy(signal));
    const override = this.#overrides?.moderate;
    const result = override?.({ system: "", messages: [{ role: "user", content: text }] });
    return Promise.resolve({
      flagged: typeof result === "object" && "flagged" in result && result.flagged === true,
    });
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
      case "plan":
        return this.#plan();
      case "turn":
        return this.#reply(turns.length);
      case "score": {
        const text = input.system + input.messages.map((m) => m.content).join(" ");
        const skill = SKILLS.find((candidate) => text.includes(candidate.slug));
        return heuristicScorecard(turns, skill?.weighted ?? "clarity");
      }
      case "guard":
        return { category: "ok" };
    }
  }

  #plan(): { scenarioPublic: ScenarioPublic; scenarioPrivate: ScenarioPrivate } {
    const next = random(this.#seed, 0);
    const persona = pick(PERSONAS, next);
    const offset = Math.floor(next() * OBJECTIONS.length);
    const count = next() < 0.5 ? 2 : 3;
    return {
      scenarioPublic: {
        ...persona,
        companyType: pick(COMPANY_TYPES, next),
        openingLine: `Hi, this is ${persona.personaName}. I have a few minutes. What can I do for you?`,
      },
      scenarioPrivate: {
        hiddenObjections: Array.from(
          { length: count },
          (_, i) => OBJECTIONS[(offset + i) % OBJECTIONS.length] ?? OBJECTIONS[0],
        ),
        winConditions: WIN_CONDITIONS.slice(0, 1 + Math.floor(next() * WIN_CONDITIONS.length)),
      },
    };
  }

  /** Student turn n gets stage n mod 5, so turn 3 raises an objection. */
  #reply(turnNumber: number): string {
    const stage = STAGES[turnNumber % STAGES.length] ?? "opening";
    return `${pick(REPLIES[stage], random(this.#seed, turnNumber))} ${stageTag(stage)}`;
  }
}
